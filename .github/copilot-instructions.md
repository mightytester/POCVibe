# Repository-Wide GitHub Copilot Instructions

## 🎯 Primary Goal
Generate complete, production-ready code for requested changes while minimizing unnecessary output and token usage.


## 🧑‍💻 Code Generation Rules

- **Generate full code implementations**, not short snippets or partial examples.
- If a file needs to be changed, output the **entire updated file** unless I explicitly ask for a diff.
- Follow the existing project structure, naming conventions, and coding style.
- Prefer clarity and correctness over brevity.


## ❌ Disallowed Outputs

- **Do NOT generate Markdown (`.md`) files** unless I explicitly request documentation.
- Do NOT auto-generate README files, design docs, or explanatory markdown.
- Do NOT generate sample usage docs unless explicitly requested.


## 🚫 No Execution or Debugging

- **Do NOT start, run, build, test, debug, or simulate the application.**
- Do NOT assume runtime behavior or environment setup.
- Leave all execution, debugging, and testing to me.


## 🤝 Interaction & Assumptions

- **Do NOT make assumptions** about missing requirements, configurations, or environment details.
- If something is unclear or required to proceed, **ask me explicitly** before generating code.
- Do not auto-fix or refactor unrelated parts of the codebase.


## 🧪 Tests & Tooling

- Do NOT generate tests unless explicitly requested.
- Do NOT add new dependencies, tools, or scripts unless I approve.


## 📌 Output Discipline

- Only generate files directly related to the requested change.
- Avoid boilerplate, placeholders, or unrelated refactors.
- Keep comments concise and relevant.
