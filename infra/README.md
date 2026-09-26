# Infrastructure — optional, not the supported path

**The supported way to deploy is `scripts/go-live.sh`, which uses `gcloud` and
nothing else.** See `docs/GO_LIVE.md` §0. It needs no third-party tool, keeps no
state file, and therefore never writes the database password into one.

What follows is a Terraform description of the same estate, kept for anyone who
wants declarative state and drift detection and is willing to take on Terraform
as a dependency. The two are alternatives: run one or the other, never both
against the same project, or each will fight the other's changes.

Declarative definition of what the platform runs on (DO-02). Applying it is a
deliberate act by someone with the credentials; nothing here runs from CI.

```bash
cd infra
terraform init
terraform plan  -var-file=environments/pilot.tfvars
terraform apply -var-file=environments/pilot.tfvars
```

Two things this deliberately does **not** do.

It does not create secrets. `terraform` creates the Secret Manager *containers*;
the values are added once, by a person, with `gcloud secrets versions add`. A
session secret or a data encryption key in a state file is a secret in a state
file.

It does not grant anyone access to the database. The Cloud SQL instance has no
public address and no default user beyond the application's. Adding a human is
a separate, audited decision.
