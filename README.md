# Smart Home

Smart Home is a standalone browser application for creating projects and drawing precise building contours. It uses an Nx workspace with Angular 22, Spartan UI Brain with application-owned Helm styles, Tailwind CSS, Konva and `@lucide/angular`.

## Run locally

Use Node.js 24.21.0 (see `.nvmrc`).

```sh
npm ci
npm start
```

Open `http://localhost:4200`. Demo login: **juralab**. Demo password: **juralab**.

```sh
npm run check     # Type-check the Angular application and templates
npm test          # Pure geometry tests
npm run e2e       # Browser interaction tests (install Chromium first)
npm run build     # Production build in dist/smart-home/browser
```

Install the test browser with `npx playwright install --with-deps chromium`. The editor's development-only inspection handle is not included in production mode.

## Application structure

- `auth-layout`: sign-in route with reactive form, error feedback and session-only demonstration access.
- `shell-layout`: shared header and router outlet. Header contains the Smart Home identity, documentation and account controls.
- `project-manager`: one new-project card followed by existing projects with geometry previews. Create and reopen projects without setup dialogs.
- `editor-layout`: toolbar, canvas, command console and status bar. Navigation and inspector zones exist but remain hidden.
- `editor/controller.js`: isolated editor state machine and event controller. Angular owns the application and controls; Konva owns its stage subtree. All listeners, timers, observers and Konva resources are disposed when leaving the route.
- `editor/geometry.js`: pure, independently tested millimetre-space geometry.

Routes are lazy-loaded and use hash navigation so direct editor links and browser reloads work on a static host. Project data is serialized independently from rendering and browser events.

## Drawing

**Graphical contours:** start with a click or X/Y coordinates. Select direction with an arrow key, enter the length in millimetres, and confirm with Enter or numeric-keypad Enter. A right click, C, or click on the initial vertex closes the contour. Completing a contour deactivates the tool; start it again for the next contour.

**Rectangles:** choose the initial point first. Move the pointer to preview dimensions, or type the active dimension. Enter or a left click locks the first side and proceeds to the second. Tab switches sides without confirmation. After both dimensions are confirmed, enter the rotation stage. Rotate around the original point using the pointer or the angle field. Enter or a left click creates the contour. The default mouse rotation step is 1 degree, with highlighted 45/90/135-degree directions. An initial point on an inclined edge uses that edge as the rectangle's local direction.

**Precision:** full-canvas crosshair, independent grid visibility and snapping, editable grid step, orthogonality, edge/point inference, parallel/perpendicular guides, and temporary point tools. The first five temporary-point commands are implemented; later command groups are explicitly disabled. Press P or click the middle mouse button to open this menu. A middle-button drag pans the view instead.

**Contours:** multiple disjoint or adjacent contours; shared boundaries are permitted. Self intersections, overlapping interiors and nested contours are rejected. Double-click a completed contour to name it. Undo/redo preserve the drawing state.

**Navigation:** wheel zoom, space + drag or middle-button pan, dedicated trackpad mode, fit to view, editable percentage zoom. Grid settings, input coordinates and rotation step are in the status bar. Contextual instructions and numerical entry are in the command console.

## Data and security boundaries

This is a client-only application. The fixed demonstration credentials and route guards are **not a security boundary**; the code and credentials are public. There is no backend, server-side authentication or multi-user authorization. Do not use this application for sensitive information.

Saved projects use versioned localStorage under `smart-home.projects.v1`. Unsaved edits survive route changes in the current application session, but not a reload. Saving re-reads stored projects to avoid deleting unrelated project IDs. Same-project concurrent editing across tabs is last-save-wins. Storage failures are reported, not silently ignored; Save offers a JSON file fallback. JSON import is not implemented. Clearing browser data removes local projects. There is no cross-device synchronization.

Geometry is a 2D footprint model, not a certified structural calculation, BIM model or construction design. Boolean unions, holes, floor assemblies, walls and structural loads are outside this version.

## GitHub Pages

The production base path is `/smarthome/`. In repository **Settings → Pages**, select **GitHub Actions** as the source. The deployment workflow installs the locked dependencies, type-checks, tests, builds and publishes the static artifact. It requests only the required job-level permissions. No deployment token is stored in source code.

A successful build is not the same as a successful deployment. The GitHub environment's deployment URL is authoritative. Initial Pages activation may require a repository administrator; a workflow token cannot always create the Pages site.

## Verification and limitations

Geometry tests and browser tests are kept in `tests/` and `e2e/`. The browser suite exercises authentication, route protection, Konva mounting, keyboard confirmation, rotated rectangles, settings, multiple contours, labels, save/reopen/reload, temporary points, combined inference, teardown and narrow screens. GitHub Actions retains browser reports and screenshots for inspection. Safari and physical trackpad behavior require separate device verification.
