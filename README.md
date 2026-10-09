# Smart Home

Smart Home is a standalone browser application for creating projects and drawing precise building contours. It uses Nx, Angular 22, Spartan UI Brain with generated Helm Card and Menu components, Tailwind CSS, Konva and `@lucide/angular`.

## Development

Use the Node.js version in `.nvmrc` and the pinned dependency lockfile.

```sh
npm ci
npm start
npm run check
npm test
npx playwright install --with-deps chromium
npm run e2e
npm run build
node e2e/production.mjs
```

`npm run check` checks TypeScript. The Angular build additionally checks templates. The production artifact is written to `dist/smart-home/browser`, with the `/smarthome/` base path. GitHub Actions builds, tests and deploys this artifact to GitHub Pages. The development inspection handle is not published in production.

Demo login and password: `juralab` / `juralab`. This is client-side demonstration access, **not secure authentication**. Do not put private or sensitive data into this public demo.

## Layout

- `auth-layout`: centered login with reactive form and validation.
- `shell-layout`: shared header and router outlet.
- `project-manager`: new-project card followed by explicitly saved projects with contour previews.
- `editor-layout`: toolbar, canvas, contextual inspector, command console and status bar. The navigation zone remains hidden.
- Modals use a shared Card structure with Header (title and close control), Content and Footer actions. Long Content scrolls while Header and Footer stay accessible.
- The inspector starts at 240 px on desktop and can be resized to 30% of the viewport. Below 800 px it uses 90% of viewport width without manual resizing.

## Project lifecycle and storage

Creating a project starts an in-memory draft. It does not create a card or write to IndexedDB. The first Save opens a name dialog. Cancelling leaves the draft unsaved; a failed transaction retains the input and geometry for retry.

Project data is stored in the `smart-home` IndexedDB database (version 1), in the `projects` object store. A project enters the manager only after the write transaction completes. Repeated Save updates the same ID. Opening a card reads the committed snapshot from IndexedDB; uncommitted editor changes do not silently replace it. Saved projects can be reopened through a direct editor URL after reload. New drafts do not survive reload.

Existing valid `smart-home.projects.v1` localStorage data is imported once into IndexedDB without deleting its source or overwriting newer IndexedDB records. Because previous versions auto-created records, their existing records are retained rather than guessed to be disposable drafts.

Data is local to this browser/profile and origin. Clearing site data removes it. There is no backend, cloud sync or cross-device synchronization. A storage failure never reports a successful save and does not automatically export a JSON file.

## Drawing and contour operations

Start a contour with the toolbar or the empty-canvas action. Choose graphical input or rectangle. The tool deactivates after completion. Use the toolbar again for another contour.

- Graphical input: mouse points or coordinates, direction arrow, length, Enter. Right click or C closes the contour. Both main Enter and NumpadEnter are supported.
- Rectangle: anchor, first side, second side, rotation. Enter or left click confirms each stage. Tab switches sides; confirmed sides stay fixed. Rotation uses the starting point as pivot; a rectangle started on an inclined edge inherits its direction.
- The grid and grid snapping are independent controls. Free input snaps to grid nodes. Exact numeric values, temporary-point commands and explicitly acquired geometry take priority. Angle step defaults to 1 degree; 45, 90 and 135 degree directions are highlighted.
- Inference retains an edge and point independently. Hover briefly or Alt-click each reference. Auxiliary axes, parallels, perpendiculars and intersections guide the next point without writing model geometry.
- The first five temporary-point commands work: intersections in a selection area, intersection of two lines, edge midpoint, midpoint between points and a point on an edge. Later groups are visible but disabled.
- Select a completed contour with a single or double click to open the inspector. Apply its name, color, dimensions and angle as one undoable edit. Dimensions refer to local axes of its first edge; the first vertex stays fixed. An arbitrary polygon is scaled in those axes, not converted into a rectangle.
- Right click a completed contour for Delete, Edit, Move, Duplicate and Rotate. During drawing the same button still closes the contour.
- Move/Duplicate: select a reference point on the source boundary, preview the target, then Enter or left click. The source remains unchanged until confirmation. Direction arrows plus distance give exact displacement.
- Rotate: choose a pivot on the source contour and preview a relative angle with the mouse or numeric input. Enter/left click commits; Esc cancels.
- Invalid intersections, overlapping areas and contained contours are rejected. Shared boundaries and point contacts are allowed. Successful edits, deletes, copies, moves and rotations support undo/redo.

Pan with middle drag or Space+left drag. In trackpad mode two fingers pan; pinch/Ctrl+wheel zooms. Use Fit or F to fit geometry. Escape cancels transient input/operations. Exact keyboard control is best tested on a desktop.

## Implementation boundaries

Angular owns routes and UI; Konva owns only its canvas subtree. `editor/controller.js` isolates interaction state and disposes its listeners, timers and observers on teardown. `geometry.js` and `contour-transform.js` contain independently testable geometry. `projects.repository.ts` owns IndexedDB transactions; `projects.store.ts` separates draft and saved state.

Tests include geometry/transaction-adapter unit tests, browser interaction tests and production base-path/reload checks. Browser-engine support and real-device behavior must be verified separately; a simulated repository test does not prove native IndexedDB persistence.

## On-canvas geometry editing

Select a completed contour (or choose Edit in its context menu). All polygon shapes use the same handles: drag a vertex to move it, drag an edge to translate its two endpoints, or drag a + handle to insert and move a new vertex. Shift-click anywhere on an edge starts insertion there. Click-then-click and arrow + distance + Enter work as alternatives to dragging. The inspector edits only name and color and reports area/perimeter; it does not resize geometry. On mobile, Edit on canvas dismisses the inspector without discarding selection.

During any point-based edit, P or a middle-button click opens the same five temporary-point resolvers used by construction. Escape cancels only the nested resolver first, then the pending edit. Vertex/edge references, their auxiliary axes, grid snapping and orthogonal constraints remain available. Exact typed lengths and explicit temporary points take precedence over approximate pointer snapping. An edit is one undoable transaction: invalid or cancelled previews never replace the original contour. Independent contours may touch but not overlap.
