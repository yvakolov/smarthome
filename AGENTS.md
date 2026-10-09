# Smart Home contributor instructions

This repository contains one standalone application: Smart Home. Do not introduce other product brands or multi-application platform assumptions.

Use the pinned Nx, Angular 22, Spartan UI, Tailwind, Konva and @lucide/angular dependencies. Preserve the tested drawing state machine and the distinction between draft values and committed geometry. Angular owns routes and controls; Konva owns only the canvas subtree. Dispose every listener, timer and observer when leaving the editor.

Keep the interface minimal: do not add persistent panels unless the user requests them. Navigation and inspector zones are initially hidden. Keep user-facing text in Russian and contributor documentation in English.

Before publishing, run type checking, geometry tests, browser interaction tests and a production build. Verify login and direct-route reloads under the /smarthome/ Pages base path. Never describe the public demo login as secure authentication. Never publish secrets. Preserve concurrent changes and avoid force pushes.
