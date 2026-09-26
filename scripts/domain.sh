#!/usr/bin/env bash
#
# Put congovoicecd.com in front of the service, with a Google-managed
# certificate.
#
#   bash scripts/domain.sh
#
# Cloud Run domain mappings are the short way to do this and are not offered in
# every region — africa-south1 is one that refuses them, which is why this
# exists. A global external Application Load Balancer works everywhere, and for
# a .cd domain whose DNS sits at a registrar rather than in Cloud DNS it is the
# answer regardless: it needs two A/AAAA records pointing at one static address,
# which any registrar can do.
#
# Idempotent, like scripts/go-live.sh: each piece is checked before it is
# created, so this is safe to run again — and it has to be run again, because a
# managed certificate is only issued once the DNS records resolve, and that is
# not instant.
#
set -euo pipefail

PROJECT="${PROJECT:-congo-voice}"
REGION="${REGION:-africa-south1}"
DOMAIN="${DOMAIN:-congovoicecd.com}"
ENVIRONMENT="${ENVIRONMENT:-pilot}"

NAME="congovoice-${ENVIRONMENT}"
SERVICE="$NAME"
NEG="${NAME}-neg"
BACKEND="${NAME}-backend"
URL_MAP="${NAME}-urlmap"
REDIRECT_MAP="${NAME}-redirect"
CERT="${NAME}-cert"
HTTPS_PROXY_NAME="${NAME}-https"
HTTP_PROXY_NAME="${NAME}-http"
ADDRESS="${NAME}-ip"
HTTPS_RULE="${NAME}-https-rule"
HTTP_RULE="${NAME}-http-rule"

step() { printf '\n\033[1m── %s\033[0m\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$*" >&2; exit 1; }
gc()   { gcloud "$@" --project="$PROJECT"; }
exists() { "$@" >/dev/null 2>&1; }

step "Checking the service is there to put a domain in front of"
gc run services describe "$SERVICE" --region="$REGION" >/dev/null 2>&1 \
  || die "No Cloud Run service '$SERVICE' in $REGION. Run scripts/go-live.sh first."
note "$(gc run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"

step "Static address"
if exists gc compute addresses describe "$ADDRESS" --global; then
  note "exists: $ADDRESS"
else
  gc compute addresses create "$ADDRESS" --global --ip-version=IPV4 >/dev/null
  note "created: $ADDRESS"
fi
IP=$(gc compute addresses describe "$ADDRESS" --global --format='value(address)')
note "address: $IP"

step "Serverless network endpoint group"
# What connects a load balancer to a Cloud Run service. It is regional and must
# sit in the service's region; everything above it is global.
if exists gc compute network-endpoint-groups describe "$NEG" --region="$REGION"; then
  note "exists: $NEG"
else
  gc compute network-endpoint-groups create "$NEG" \
    --region="$REGION" --network-endpoint-type=serverless \
    --cloud-run-service="$SERVICE" >/dev/null
  note "created: $NEG"
fi

step "Backend service"
# --timeout is the whole reason a voice turn failed with "Failed to fetch".
#
# A backend service defaults to thirty seconds. One spoken question is an audio
# upload, a transcription, a language decision, an answer and a speech synthesis
# — routinely more than thirty seconds, and much more on the first request to a
# cold instance. The load balancer closed the connection mid-request and the
# browser reported a network failure, which looks like the citizen's signal
# rather than our configuration.
#
# 300s matches Cloud Run's own request timeout, so the platform decides when a
# turn has taken too long, not the hop in front of it.
BACKEND_TIMEOUT="${BACKEND_TIMEOUT:-300}"
if exists gc compute backend-services describe "$BACKEND" --global; then
  current=$(gc compute backend-services describe "$BACKEND" --global --format='value(timeoutSec)')
  if [[ "$current" == "$BACKEND_TIMEOUT" ]]; then
    note "exists: $BACKEND (délai ${current}s)"
  else
    gc compute backend-services update "$BACKEND" --global --timeout="$BACKEND_TIMEOUT" >/dev/null
    note "exists: $BACKEND — délai porté de ${current}s à ${BACKEND_TIMEOUT}s"
  fi
else
  gc compute backend-services create "$BACKEND" \
    --global --load-balancing-scheme=EXTERNAL_MANAGED \
    --timeout="$BACKEND_TIMEOUT" >/dev/null
  note "created: $BACKEND (délai ${BACKEND_TIMEOUT}s)"
fi
if gc compute backend-services describe "$BACKEND" --global \
     --format='value(backends[].group)' | grep -q "$NEG"; then
  note "backend already attached"
else
  gc compute backend-services add-backend "$BACKEND" \
    --global --network-endpoint-group="$NEG" \
    --network-endpoint-group-region="$REGION" >/dev/null
  note "attached $NEG"
fi

step "Certificate for $DOMAIN"
# Google issues and renews it, but only once the DNS below resolves to this
# load balancer. PROVISIONING is the normal state until then.
if exists gc compute ssl-certificates describe "$CERT" --global; then
  note "exists: $CERT"
else
  gc compute ssl-certificates create "$CERT" --global \
    --domains="${DOMAIN},www.${DOMAIN}" >/dev/null
  note "created for ${DOMAIN} and www.${DOMAIN}"
fi

step "Routing"
if exists gc compute url-maps describe "$URL_MAP" --global; then
  note "exists: $URL_MAP"
else
  gc compute url-maps create "$URL_MAP" --default-service="$BACKEND" --global >/dev/null
  note "created: $URL_MAP"
fi

if exists gc compute target-https-proxies describe "$HTTPS_PROXY_NAME" --global; then
  note "exists: $HTTPS_PROXY_NAME"
else
  gc compute target-https-proxies create "$HTTPS_PROXY_NAME" \
    --global --url-map="$URL_MAP" --ssl-certificates="$CERT" >/dev/null
  note "created: $HTTPS_PROXY_NAME"
fi

if exists gc compute forwarding-rules describe "$HTTPS_RULE" --global; then
  note "exists: $HTTPS_RULE"
else
  gc compute forwarding-rules create "$HTTPS_RULE" \
    --global --load-balancing-scheme=EXTERNAL_MANAGED \
    --address="$ADDRESS" --target-https-proxy="$HTTPS_PROXY_NAME" --ports=443 >/dev/null
  note "created: $HTTPS_RULE (443)"
fi

step "Plain HTTP, redirected"
# Not optional. A citizen who types the domain without a scheme arrives on port
# 80, and a load balancer that answers only on 443 looks like a dead site. The
# redirect is also what keeps the signed telephony callback URLs consistent:
# they are built from the https origin the image was compiled with.
if ! exists gc compute url-maps describe "$REDIRECT_MAP" --global; then
  redirect=$(mktemp)
  cat > "$redirect" <<YAML
name: ${REDIRECT_MAP}
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
  stripQuery: false
YAML
  gc compute url-maps import "$REDIRECT_MAP" --global --source="$redirect" --quiet >/dev/null
  rm -f "$redirect"
  note "created: $REDIRECT_MAP"
else
  note "exists: $REDIRECT_MAP"
fi

if exists gc compute target-http-proxies describe "$HTTP_PROXY_NAME" --global; then
  note "exists: $HTTP_PROXY_NAME"
else
  gc compute target-http-proxies create "$HTTP_PROXY_NAME" \
    --url-map="$REDIRECT_MAP" --global >/dev/null
  note "created: $HTTP_PROXY_NAME"
fi

if exists gc compute forwarding-rules describe "$HTTP_RULE" --global; then
  note "exists: $HTTP_RULE"
else
  gc compute forwarding-rules create "$HTTP_RULE" \
    --global --load-balancing-scheme=EXTERNAL_MANAGED \
    --address="$ADDRESS" --target-http-proxy="$HTTP_PROXY_NAME" --ports=80 >/dev/null
  note "created: $HTTP_RULE (80)"
fi

# ── What is left for a person to do ──────────────────────────────────────────

CERT_STATUS=$(gc compute ssl-certificates describe "$CERT" --global \
  --format='value(managed.status)' 2>/dev/null || echo UNKNOWN)

step "DNS — this is the part nobody else can do for you"
cat <<RECORDS

   At the registrar holding ${DOMAIN}, create exactly these:

     Type    Name              Value
     A       @   (apex)        ${IP}
     A       www               ${IP}

   Nothing else. No CNAME on the apex, and remove any A, AAAA or CNAME
   already on @ or www that points elsewhere — a stale record is the usual
   reason a certificate never leaves PROVISIONING.

RECORDS

step "Certificate: $CERT_STATUS"
case "$CERT_STATUS" in
  ACTIVE)
    note "Issued. The domain is live:"
    printf '\n'
    note "  curl -sI https://${DOMAIN} | head -3"
    note "  npm run preflight -- https://${DOMAIN}"
    ;;
  PROVISIONING)
    note "Google is waiting for ${DOMAIN} to resolve to ${IP}."
    note "Usually 15 to 60 minutes after the records propagate, sometimes longer."
    printf '\n'
    note "Check what the world currently sees:"
    note "  dig +short ${DOMAIN} @8.8.8.8"
    printf '\n'
    note "Then run this script again — it changes nothing and reports the status."
    ;;
  *)
    note "Unexpected state. Read it directly:"
    note "  gcloud compute ssl-certificates describe ${CERT} --global --project=${PROJECT}"
    ;;
esac
printf '\n'
note "Until the certificate is ACTIVE the service is still reachable on its"
note "run.app URL. Do not send citizens to that URL: the image was built with"
note "https://${DOMAIN} as its origin, so canonical links, the sitemap and the"
note "signed telephony callbacks all name the domain, not run.app."
printf '\n'
