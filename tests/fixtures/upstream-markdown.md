---
title: Upstream Markdown validation
published: 2026-10-24
description: Synthetic rendering fixture
tags: [Markdown]
category: Validation
draft: false
image: /images/upstream-validation.svg
---

## Standard Markdown

Paragraph **strong** *emphasis* ~~removed~~ and `inline code`.

- First item
- Second item

| Feature | State |
| --- | --- |
| GFM | Enabled |

Footnote reference[^note].

[^note]: Upstream footnote body.

## Enhanced syntax

> [!NOTE]
> Upstream alert body.

:::details[Native disclosure]
Full readable body.
:::

![Local attachment w-50%](/images/upstream-validation.svg "Upstream caption")

Inline $x^2 + y^2$.

$$
E = mc^2
$$

```ts title="example.ts" {1}
const answer = 42;
console.log(answer);
```

```mermaid
flowchart LR
  A[Markdown] --> B[Shirone]
```

[[Literal wiki]] %%literal comment%%

[Visit home](/)
