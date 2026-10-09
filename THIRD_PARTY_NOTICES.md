# UI component provenance

The Card and Menu directives are generated/adapted from the MIT-licensed `@spartan-ng/cli` 1.6.3 templates already installed in the pinned toolchain. Menu behavior uses the Angular CDK and Spartan Brain core APIs. The class helper and CSS are application-owned adaptations to the Smart Home theme. No font binaries are included.

Source package: `@spartan-ng/cli@1.6.3` (card and dropdown-menu generators). Existing `HlmButton` and `HlmInput` remain backed by Spartan Brain primitives. Native HTML dialogs retain browser modality/focus trapping while their content uses the shared Helm Card regions.
