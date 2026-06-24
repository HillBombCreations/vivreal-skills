# Vivreal Skills — Prompt Playbook

Reusable, fill-in-the-bracket prompt templates for invoking the `vivreal-skills` ecosystem with
optimal routing — 11 scenario templates, a trigger cheat-sheet (which words route to which agent),
and a slash-command quick reference.

## Where it lives

The **canonical** playbook ships inside the `vivreal-workflow` plugin so the `/promptify` command can
read it at runtime, even when the plugin is installed in another repo:

> **[`vivreal-workflow/skills/cmd-promptify/prompt-playbook.md`](../vivreal-workflow/skills/cmd-promptify/prompt-playbook.md)**

Read that file for the full templates. Edit it there too — it's the single source of truth (this
pointer exists only so the playbook is discoverable from `docs/`).

## The faster way to use it

Don't hand-copy a template. Run **`/promptify`** with your request in plain words and it will pick the
right scenario, fill the brackets from what you said, flag anything missing, name the slash command it
routes to, and either run it or hand you a clean copy-paste block:

```
/promptify the publish button is broken for the acme group, sentry VR-1234
```
