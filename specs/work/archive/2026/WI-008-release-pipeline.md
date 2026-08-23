# WI-008: Построить CI и open-source release pipeline

- Kind: `change`
- Canon action: `direct-edit`

## Outcome

Immutable tag автоматически производит draft coordinator images, worker packages, checksums, SBOM, provenance и release receipt после полного CI.

## Specs

- Governing: `spec://modules/distribution/INFRA-004-open-source-release#ci`
- Governing: `spec://modules/distribution/INFRA-004-open-source-release#artifacts`
- Affected: `spec://modules/distribution/INFRA-004-open-source-release#decisions`
- Constraint: `spec://modules/distribution/PROP-102-distribution#rules`

## Scope

- In: GitHub Actions PR/main/tag jobs, pinned permissions, multi-arch image, deterministic manifests/packages, SHA256SUMS, SBOM, attestations, draft release and verification receipt.
- Out: final public release и repository visibility switch.

## Dependencies

- Depends on: `WI-007`

## Acceptance

- [x] Fork PR CI не получает release secrets.
- [x] Version/tag mismatch fail-closed.
- [x] Linux/macOS/Windows jobs проходят exact revision.
- [x] Image/packages/checksums/SBOM/provenance/receipt согласованы.
- [x] Release остаётся draft до clean-room acceptance.

## Result

Реализован tag-only release workflow с pinned actions и минимальными job
permissions. Annotated `v0.2.0-alpha.0` на
`64fc42fdf0ebb26254d775a467c1754ca7fd4eee` прошёл release run
`32664982727`: quality/history/license gates, reproducible packages,
Linux multi-architecture image, macOS/Windows package smoke, SPDX SBOM,
Trivy zero high/critical, checksums, provisional private provenance и draft
receipt. Все 15 draft assets скачаны повторно, `SHA256SUMS` проверен полностью,
version/revision manifests совпали с tag SHA. PR workflow имеет только
`contents: read` и не обращается к secrets; это закреплено regression test.
Live external-fork и GitHub-signed attestation входят в public gate `WI-010`,
поскольку GitHub Free предоставляет signed attestations только public
repositories. Evidence: `docs/evidence/release-pipeline-WI-008.json`.
