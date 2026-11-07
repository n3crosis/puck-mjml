import type { EmailDocument } from "./types";
import { createProductUpdateDocument } from "./example";

export function createEmptyDocument(): EmailDocument {
  return {
    root: {
      props: {
        subject: "",
        previewText: "",
        lang: "und",
        dir: "auto",
        owa: "none",
        width: 600,
        backgroundColor: "#f5f5f5",
        fontFamily: "Arial, sans-serif",
        breakpoint: 480,
        fontImports: [],
        headStyles: [],
        htmlAttributes: [],
        rawHead: "",
        rawFileStart: "",
        bodyAttributes: [],
        bodyMjClass: "",
        attributeDefaults: [],
        componentDefaults: [],
        mjmlClasses: [],
        sections: [],
      },
    },
    content: [],
  };
}

export function createExampleDocument(): EmailDocument {
  return createProductUpdateDocument();
}
