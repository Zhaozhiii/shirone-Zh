# Markdown 兼容示例

单次换行
仍在同一段落。

硬换行：\
下一行。

**粗体**、*斜体*、~~删除线~~、==高亮==、H~2~O、x^2^、:smile:、#知识/Markdown。

[[Public#Section|章节链接]] · [[Private|未公开笔记]] · [[Missing|失效引用]]。

![[Public#Section]]

![[Private]]

> [!success]- **可折叠标题**
> Shirone 样式保持不变。
>
> > [!question]+ 嵌套标题
> > 支持列表和公式 $x^2$。

- [x] 已完成
- [ ] 待完成
  - 嵌套条目

| 语法 | 状态 |
| --- | --- |
| GFM | 支持 |

标准脚注[^example]，以及行内脚注^[支持 **Markdown** 的说明]。

[^example]: 可返回正文的脚注。

$x^2$ 和 \(y^2\)。

$$
\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}
$$

\[
\sum_{i=1}^{n}i=\frac{n(n+1)}{2}
\]

```typescript
const literal = "[[Private]] %%not a comment%%";
```

%%
COMMENT_SENTINEL_NOT_VISIBLE
![[secret.png]]
%%

<details><summary>HTML</summary>HTML 中的 [[Private]] 保持原文。</details>
