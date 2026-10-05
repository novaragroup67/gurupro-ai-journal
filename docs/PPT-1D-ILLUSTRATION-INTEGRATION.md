# PPT-1D — Illustration Integration into Real PPTX Generation

## 1. Overview & Architectural Role

Stage **PPT-1D** connects the completed teacher-approved illustration pipeline (**VIS-1A through VIS-1E**) with the real OpenXML presentation rendering engine (**PPT-1A through PPT-1C**).

Prior to this stage:
- PPT-1C rendered structured presentation content into native `.pptx` documents, rendering placeholder shapes whenever slides requested illustrations.
- VIS-1A to VIS-1E managed illustration generation contracts, generation, storage, teacher review, and quality gates.

In PPT-1D:
- Slides referencing existing illustrations have their assets verified, fetched from storage, validated cryptographically, and embedded directly into the PPTX package as native OpenXML media (`ppt/media/image-*.png`).
- Teacher reviews serve as the authoritative gatekeeper: unapproved, rejected, or pending illustrations fail closed.
- Strict non-generation invariants are enforced: zero calls are made to AI image generation models.

---

## 2. Invariants & Security Controls

### Strict Teacher Approval Gate
- **Invariant**: Only illustrations with `review_status === "approved_for_use"` are embedded.
- **Fail-Closed Policy**: Assets with review status `pending`, `reviewed`, `rejected`, or missing review rows immediately trigger typed error `PPTX_UNAPPROVED_ILLUSTRATION`.

### Lifecycle Status Gate
- **Invariant**: Assets must have `lifecycle_status === "staged"` or `"attached"`.
- **Rejection**: Assets marked as `"archived"` or `"soft_deleted"` throw `PPTX_ILLUSTRATION_LIFECYCLE_INVALID`.

### Multi-Tenant Ownership & RBAC
- **Strict Tenant Isolation**: Assets belonging to Teacher B cannot be embedded by Teacher A (`ROLE_FORBIDDEN`).
- **Student Rejection**: The `siswa` (student) role is strictly prohibited from rendering presentations or accessing teacher illustrations.

### Cryptographic Binary Integrity
- Downloaded image bytes are verified against the canonical `sha256_hash` stored in the asset record before being passed to the presentation renderer (`PPTX_ILLUSTRATION_LOAD_FAILED` if mismatched).
- Supported MIME types are limited to `image/png`, `image/jpeg`, and `image/webp`.

### Zero AI Generation Invariant
- PPT-1D performs zero AI image generation requests. It is purely an integration and rendering stage for existing approved media.

---

## 3. Layout Engine & Placements

The layout engine (`computeIllustrationSlideLayout`) calculates non-overlapping coordinates within the slide's content area while preserving the image's original aspect ratio:

| Placement | Layout Split | Description |
| :--- | :--- | :--- |
| `right` | 55% Text (Left), 45% Illustration (Right) | Default side-by-side layout with optional caption below image |
| `left` | 45% Illustration (Left), 55% Text (Right) | Inverted side-by-side layout |
| `center` | Top Header/Text, Centered Illustration | Visual focus slide with centered image |
| `full_width` | Full Content Width Hero | Hero visual spanning content width, fitting within slide bounds |
| `split_card` | 55% Text, 45% Illustration with Card container | Highlighted card container layout |

All calculated bounding boxes are validated against slide canvas dimensions (`assertWithinSlideBounds`), preventing any visual overflow.

---

## 4. Real OpenXML Package Structure

When an illustration is embedded, PptxGenJS generates a genuine Microsoft PowerPoint OpenXML document:
1. **Media Part**: Image binary stored at `ppt/media/image-*.png` (or `.jpeg`).
2. **Slide Relationship**: `ppt/slides/_rels/slideX.xml.rels` defines `<Relationship Type=".../relationships/image" Target="../media/image-*-*.png" />`.
3. **Slide Markup**: `ppt/slides/slideX.xml` instantiates `<p:pic>` with shape properties, transform coordinates, and reference to the relationship ID.
4. **Caption & Text**: Rendered cleanly in adjacent text boxes without collision.

---

## 5. Test Suite Verification

The complete PPT-1D test suite (`npm run test:ppt1d`) validates all 41 test scenarios:
- **Suite 1**: Canonical contracts & reference schemas (Tests 1–5)
- **Suite 2**: Strict teacher approval invariants (Tests 6–11)
- **Suite 3**: Asset lifecycle enforcement (Tests 12–14)
- **Suite 4**: Multi-tenant RBAC & ownership security (Tests 15–16)
- **Suite 5**: Storage retrieval & SHA-256 verification (Tests 17–19)
- **Suite 6**: Layout engine & aspect ratio preservation (Tests 20–26)
- **Suite 7**: Real PPTX document rendering with embedded media (Tests 27–32)
- **Suite 8**: Package validator integration (Test 33)
- **Suite 9**: Mixed slides presentation (Tests 34–35)
- **Suite 10**: Server functions & idempotency (Tests 36–39)
- **Suite 11**: Strict non-generation invariants (Tests 40–41)
