# Infrastructure

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
