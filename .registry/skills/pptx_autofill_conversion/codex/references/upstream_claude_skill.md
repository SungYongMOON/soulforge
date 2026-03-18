# Upstream Claude Skill Summary

## Source

- Upstream package name: `pptx-autofill-conversion`
- Source type: user-provided Claude skill package and local PPTX supporting examples

## Trigger shape

Use when:

- a PPTX template is attached and the user asks to keep the format while changing the topic
- the user asks for PPTX auto-fill, slide auto-generation from a form, or same-layout content replacement

## Imported workflow shape

1. Confirm inputs:
   - template PPTX
   - new topic
   - optional metadata such as instructor, organization, dates, or audience
2. Inspect the template:
   - extract slide text
   - map slide roles
   - inspect tables and grouped shapes
3. Build a bounded content map
4. Replace text at XML level
5. Validate and review

## Soulforge adaptation

- The upstream prompt is condensed into a lean bridge plus references.
- Local install instructions are not copied into canon.
- User-provided sample PPTX files remain runtime inputs rather than tracked skill assets.
