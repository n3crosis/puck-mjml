import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import { ArrowsVerticalIcon } from "@phosphor-icons/react/dist/csr/ArrowsVertical";
import { CodeIcon } from "@phosphor-icons/react/dist/csr/Code";
import { ColumnsIcon } from "@phosphor-icons/react/dist/csr/Columns";
import { ColumnsPlusRightIcon } from "@phosphor-icons/react/dist/csr/ColumnsPlusRight";
import { CursorClickIcon } from "@phosphor-icons/react/dist/csr/CursorClick";
import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { ImageIcon } from "@phosphor-icons/react/dist/csr/Image";
import { ImagesIcon } from "@phosphor-icons/react/dist/csr/Images";
import { LayoutIcon } from "@phosphor-icons/react/dist/csr/Layout";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { ListPlusIcon } from "@phosphor-icons/react/dist/csr/ListPlus";
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { RectangleIcon } from "@phosphor-icons/react/dist/csr/Rectangle";
import { RowsIcon } from "@phosphor-icons/react/dist/csr/Rows";
import { ShareNetworkIcon } from "@phosphor-icons/react/dist/csr/ShareNetwork";
import { StackIcon } from "@phosphor-icons/react/dist/csr/Stack";
import { TableIcon } from "@phosphor-icons/react/dist/csr/Table";
import { TextTIcon } from "@phosphor-icons/react/dist/csr/TextT";

const blocks: Record<string, { label: string; description: string; icon: Icon; layout?: boolean }> =
  {
    Section1: {
      label: "1 column",
      description: "One column section",
      icon: RectangleIcon,
      layout: true,
    },
    Section2: {
      label: "2 columns",
      description: "Two column section",
      icon: ColumnsIcon,
      layout: true,
    },
    Section3: {
      label: "3 columns",
      description: "Three column section",
      icon: ColumnsPlusRightIcon,
      layout: true,
    },
    Section: {
      label: "Flexible",
      description: "Flexible section for columns and groups",
      icon: LayoutIcon,
      layout: true,
    },
    Column: {
      label: "Column",
      description: "Column inside a flexible section",
      icon: RectangleIcon,
      layout: true,
    },
    Group: {
      label: "Group",
      description: "Columns that stay together on mobile",
      icon: StackIcon,
      layout: true,
    },
    Wrapper: {
      label: "Wrapper",
      description: "Wrapper around email sections",
      icon: RowsIcon,
      layout: true,
    },
    Hero: {
      label: "Hero",
      description: "Hero with a background image",
      icon: ImageIcon,
      layout: true,
    },
    Text: { label: "Text", description: "Editable rich text", icon: TextTIcon },
    Image: { label: "Image", description: "Image with optional link", icon: ImageIcon },
    Button: { label: "Button", description: "Call to action button", icon: CursorClickIcon },
    Spacer: { label: "Spacer", description: "Vertical spacing", icon: ArrowsVerticalIcon },
    Divider: { label: "Divider", description: "Horizontal divider", icon: MinusIcon },
    Social: { label: "Social", description: "Social links and icons", icon: ShareNetworkIcon },
    Navbar: { label: "Navigation", description: "Navigation links", icon: ListIcon },
    Table: { label: "Table", description: "Table with editable cells", icon: TableIcon },
    Accordion: {
      label: "Accordion",
      description: "Expandable questions and answers",
      icon: ListPlusIcon,
    },
    Carousel: { label: "Carousel", description: "Image carousel", icon: ImagesIcon },
    Raw: { label: "HTML", description: "Trusted raw HTML", icon: CodeIcon },
  };

/** Only replaces the contents: Puck keeps the drag ref, keyboard events, and permissions. */
export function BlockPaletteItem({ name, children }: { name: string; children: ReactNode }) {
  const block = blocks[name];
  if (!block) return <>{children}</>;
  const BlockIcon = block.icon;
  return (
    <div
      className="pm-block-tile"
      data-pm-block={name}
      data-pm-block-kind={block.layout ? "layout" : "content"}
      title={block.description}
    >
      <BlockIcon
        className="pm-block-tile-icon"
        weight="regular"
        aria-hidden="true"
        focusable="false"
      />
      <span className="pm-block-tile-label">{block.label}</span>
      <DotsSixVerticalIcon
        className="pm-block-tile-grip"
        weight="bold"
        aria-hidden="true"
        focusable="false"
      />
    </div>
  );
}
