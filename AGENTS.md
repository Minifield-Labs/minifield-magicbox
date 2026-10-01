# MagicBox

Read README.md before changes.

- This independent repository owns MagicBox's React textbox, extraction presentation, interaction state, and styling. The host supplies inference through onExtract. Runtime integration belongs to the host.
- Preserve the original MagicBox demo's document pane, numbered extraction rail, and bottom-anchored detail card. Use native controls, scoped CSS, stable data-part attributes, and the graphite, warm-white, ember palette. Theme and unstyled modes must share behavior.
- Keep React as a peer dependency. Don't introduce a runtime UI framework, CSS reset, model download, telemetry, persistence, or sibling-source import.
- Keep the public API small. Preserve controlled and uncontrolled inputs, native textarea refs, form compatibility, cancellation, Unicode source offsets, and exact source text.
- Don't add disclaimers, footnotes, implementation explanations, or defensive copy to the demo or component. Keep engineering explanations in the conversation.
- Don't add documentation, audit reports, procedure guides, test reports, or expand the README unless the user explicitly asks. Keep the README to installation, a usage example, and the license.
- Run npm run check for source changes. Verify the package tarball and visually inspect the demo at desktop and mobile sizes.
- Work on a feature branch and open a pull request. Never commit directly to main or merge without the user's explicit request. Use conventional commits.
- Preserve unrelated changes. Keep generated builds, dependencies, test output, and model assets outside Git.
