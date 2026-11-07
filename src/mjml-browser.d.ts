declare module "mjml-browser" {
  interface MjmlResult {
    html: string;
    errors: Array<{ line?: number; message: string; tagName?: string }>;
  }
  const mjml2html: (
    mjml: string,
    options?: { validationLevel?: "soft" | "strict" | "skip" },
  ) => MjmlResult | Promise<MjmlResult>;
  export default mjml2html;
}
