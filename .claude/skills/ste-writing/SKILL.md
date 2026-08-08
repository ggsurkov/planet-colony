---
name: ste-writing
description: Write or edit prose in Simplified Technical English (STE) — short, unambiguous sentences for docs, commit messages, error messages, and LLM prompts. Required by CLAUDE.md Rule 13 for every piece of prose.
---

# Simplified Technical English (STE)

STE is a controlled-language standard (based on ASD-STE100, the aerospace
maintenance-documentation standard). It removes ambiguity by fixing sentence
shape and vocabulary, not by dumbing down content.

## Two modes

**Strict mode** — procedures, runbooks, error messages, LLM prompts (system
prompts, instruction blocks, tool descriptions). Follow every rule below with
no exceptions.

**STE-flavored mode** — everything else (docs, READMEs, commit messages, PR
text, release notes, code comments). Follow the rules as a strong default;
break a rule when natural prose reads better and the meaning stays unambiguous.

Announce which mode you used at the end of the piece of writing.

## Core rules

1. **One instruction or fact per sentence.** Split compound sentences joined
   by "and" / "which" / "while" into separate sentences.
2. **Active voice, present tense.** "The engine renders the planet," not
   "The planet is rendered by the engine."
3. **Short sentences.** Target under 20 words (strict mode: hard cap 25).
4. **Simple sentence structure.** Subject–verb–object. Avoid nested clauses.
5. **One term per concept.** Never vary vocabulary for style — if you call it
   a "colony," don't later call it a "settlement" or "outpost."
6. **Approved verb modals only:**
   - "must" for requirements, not "should" or "needs to."
   - "can" for capability/permission, not "may" or "is able to."
   - Do not use "will" for anything except a genuine future event.
7. **No gerunds as nouns.** Write "to configure the server," not "server
   configuration," when it's an action, not a fixed name.
8. **No idioms, jargon, or humor.** A term must mean the same thing to every
   reader, including non-native speakers.
9. **Define acronyms on first use.** After that, use the acronym consistently.
10. **Prefer lists over prose for sequences.** Numbered steps for procedures,
    bullets for unordered facts.
11. **Say what IS true, not what is NOT.** Prefer positive statements; use
    negatives only when the negative is the actual instruction ("Do not
    delete the file").
12. **No vague quantifiers.** Replace "some," "several," "many" with exact
    numbers or concrete criteria where they matter.

## Not covered by this skill

Code, identifiers, command syntax, and literal examples/schemas/output
templates inside a prompt — leave these exactly as correctness requires, even
if they don't read like STE.

## When to skip

Skip this skill entirely when the user asks for a different style, or when
the text needs a distinct voice (marketing copy, narrative, a character's
dialogue). Say so instead of silently applying STE.

## Quick self-check before finishing

- Could a sentence be split into two without losing meaning? Split it.
- Does any sentence exceed the word cap? Shorten it.
- Is the same idea called by two different names anywhere? Pick one.
- Any "should"/"may"/"will" that should be "must"/"can"? Fix it.
