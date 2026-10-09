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

TypeScript is checked by `npm run check`; Angular templates are additionally checked by the build. Production output is `dist/smart-home/browser`, with the `/smarthome/` base path. GitHub Actions runs tests, builds and deploys to GitHub Pages. The development inspection handle is absent in production.

Demo login and password: `juralab` / `juralab`. This is client-side demonstration access, **not secure authentication**. Do not put private or sensitive data into this public demo.

## Layout

- `auth-layout`: centered login with reactive form and validation.
- `shell-layout`: shared header and router outlet.
- `project-manager`: new-project card followed by explicitly saved projects with previews.
- `editor-layout`: toolbar, canvas, contextual inspector, command console and status bar. Navigation remains hidden.
- Modals use a shared Card with Header (title and close control), scrollable Content and Footer actions.
- Inspector width is initially 240 px and resizable to 30% of the desktop viewport. Below 800 px it is 90% of the viewport, without manual resizing.

## Project lifecycle and storage

Creating a project starts an in-memory draft, without creating a gallery card or writing to IndexedDB. First Save asks for a name. Cancelling leaves the draft unsaved; failed transactions retain the input and geometry for retry. The gallery exposes a project only after its write transaction completes. Repeated Save updates the same ID.

Storage uses the `smart-home` IndexedDB database, version 1, and the `projects` object store. Opening a card reads its committed snapshot, not unsaved editor changes. Saved projects survive a direct editor URL reload. New drafts do not survive reload.

Valid legacy `smart-home.projects.v1` localStorage records are imported once without deleting the source or overwriting newer IndexedDB data. Earlier versions auto-created records: these existing records are retained rather than guessed to be disposable drafts.

Data is local to this browser/profile and origin. Clearing site data removes it. There is no backend, cloud sync or cross-device synchronization. Storage failure never reports success and does not automatically export a JSON file.

## Drawing

Choose the contour tool, then graphical input or rectangle. The tool deactivates after completion.

- Graphical: mouse points or initial coordinates; arrow, length, Enter. Right click or C closes. Main Enter and NumpadEnter work.
- Rectangle: anchor, first side, second side, rotation. Enter/left click confirms each stage; Tab switches sides. Confirmed sides remain fixed. Rotation uses the starting point as pivot; starting on an inclined edge inherits its direction.
- Grid visibility and grid snapping are independent. Free input snaps to nodes. Exact numeric values, temporary points and explicitly acquired geometry take priority. Angular step defaults to 1 degree; 45, 90 and 135 degree directions are highlighted.
- Inference retains an edge and vertex independently. Dwell or Alt-click each reference. Auxiliary axes, parallels, perpendiculars and intersections guide the cursor without adding model geometry.
- P or a middle-button click opens temporary points: intersections in a selection area, intersection of two lines, edge midpoint, midpoint between two points, and a point on an edge. The later groups are visible but disabled.

## On-canvas editing

Select a finished contour, or choose Edit in its context menu. All polygons use the same mechanics: drag a vertex, drag an edge to translate its endpoints, or drag a + handle to insert and move a vertex. Shift-click anywhere on an edge starts insertion there. Click-then-click and arrow + distance + Enter are alternatives to dragging.

All five temporary-point resolvers remain available during vertex, edge and insertion edits. Escape first cancels a nested resolver, then the outer edit. Edge/vertex references, auxiliary axes, grid snapping, orthogonality and precise numeric input remain available. Original geometry stays unchanged until confirmation. An edit is one undoable transaction; invalid or cancelled previews never replace the contour.

The inspector edits only name and color and reports area/perimeter; it does not resize geometry. On mobile, Edit on canvas dismisses the inspector without discarding selection.

Right click a contour for Delete, Edit, Move, Duplicate and Rotate. Move/Duplicate ask for a source-boundary anchor, then a target with preview. Rotate asks for a pivot, then a relative angle. Enter/left click commits, Escape cancels. Independent contours may touch or share boundaries, but not overlap, nest or self-intersect. Completed operations support undo/redo.

## Navigation and implementation

Middle drag or Space+left drag pans. Trackpad mode uses two-finger pan and pinch/Ctrl+wheel zoom. F or Fit fits geometry; zoom percentage is editable.

Angular owns routes and controls; Konva owns only its canvas subtree. `editor/controller.js` disposes all listeners, timers and observers on teardown. `geometry.js`, `contour-transform.js` and `contour-edit.js` hold testable geometry. `projects.repository.ts` owns IndexedDB transactions; `projects.store.ts` separates draft and saved state.

Tests cover geometry, transaction adapters, actual browser IndexedDB, mouse/keyboard editing, all temporary-point/edit combinations, centered layouts and production base-path reloads. Other browser engines and physical input devices require separate verification.
