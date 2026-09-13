export declare const SUFFIX: RegExp;
export declare const DOMINANCE: number;
export declare function computeAliases(index: {
  communes: Record<string, { slug: string; pop: number }>;
  slug_to_insee: Record<string, string>;
}): { redirect: Record<string, string>; choose: Record<string, string[]> };
