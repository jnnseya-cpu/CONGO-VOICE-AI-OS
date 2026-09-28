# Test fixtures

## camera-photo.heic

A genuine HEVC-coded HEIC: `ftyp mif1`, compatible brands `heic` and `hevc`,
1280×854 — the same container and codec a phone camera writes.

It is here because its absence cost a production failure. The HEIC path shipped
with this comment in `src/server/core/images.ts`:

> Not verified in this container: decoding a genuine camera HEIC. No HEIC
> encoder is available here to produce a real one, so the tests cover detection,
> routing and the failure path.

Detection, routing and the failure path all passed. The decode did not exist in
the deployed image at all, and nothing that ran on source could see it. A real
file decoded by the built artefact is the only check that would have caught it.

Source: the `examples/example.heic` sample from strukturag/libheif (LGPL-3.0),
the reference implementation of the format.
