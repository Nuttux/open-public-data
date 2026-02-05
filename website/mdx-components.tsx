import type { MDXComponents } from "mdx/types";

/**
 * Custom MDX components for blog styling
 * These components override default HTML elements in MDX files
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Headings with proper styling
    h1: ({ children }) => (
      <h1 className="text-4xl font-bold text-white mb-6 mt-8">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-2xl font-semibold text-white mb-4 mt-8 pb-2 border-b border-slate-700">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-xl font-semibold text-slate-200 mb-3 mt-6">{children}</h3>
    ),
    // Paragraphs
    p: ({ children }) => (
      <p className="text-slate-300 leading-relaxed mb-4">{children}</p>
    ),
    // Links
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
        target={href?.startsWith("http") ? "_blank" : undefined}
        rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    ),
    // Lists
    ul: ({ children }) => (
      <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2 ml-4">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside text-slate-300 mb-4 space-y-2 ml-4">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="text-slate-300">{children}</li>,
    // Code blocks
    pre: ({ children }) => (
      <pre className="bg-slate-800 border border-slate-700 rounded-lg p-4 overflow-x-auto mb-4 text-sm">
        {children}
      </pre>
    ),
    code: ({ children }) => (
      <code className="bg-slate-800 text-emerald-400 px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ),
    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-emerald-500 pl-4 italic text-slate-400 my-4">
        {children}
      </blockquote>
    ),
    // Horizontal rule
    hr: () => <hr className="border-slate-700 my-8" />,
    // Strong and emphasis
    strong: ({ children }) => (
      <strong className="font-semibold text-white">{children}</strong>
    ),
    em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
    // Images
    img: ({ src, alt }) => (
      <img
        src={src}
        alt={alt}
        className="rounded-lg my-6 w-full"
      />
    ),
    ...components,
  };
}
