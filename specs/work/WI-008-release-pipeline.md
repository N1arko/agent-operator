# WI-008: Построить CI и open-source release pipeline

- Kind: `implement`
- Canon action: `none`

## Outcome

Immutable tag автоматически производит draft coordinator images, worker packages, checksums, SBOM, provenance и release receipt после полного CI.

## Specs

- Governing: `spec://modules/distribution/INFRA-004-open-source-release#ci`
- Governing: `spec://modules/distribution/INFRA-004-open-source-release#artifacts`
- Constraint: `spec://modules/distribution/PROP-102-distribution#rules`

## Scope

- In: GitHub Actions PR/main/tag jobs, pinned permissions, multi-arch image, deterministic manifests/packages, SHA256SUMS, SBOM, attestations, draft release and verification receipt.
- Out: final public release и repository visibility switch.

## Dependencies

- Depends on: `WI-007`

## Acceptance

- [ ] Fork PR CI не получает release secrets.
- [ ] Version/tag mismatch fail-closed.
- [ ] Linux/macOS/Windows jobs проходят exact revision.
- [ ] Image/packages/checksums/SBOM/provenance/receipt согласованы.
- [ ] Release остаётся draft до clean-room acceptance.

## Result

Заполняется при завершении.
