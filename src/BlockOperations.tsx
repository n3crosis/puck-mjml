import {
  createContext,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
  type Context,
} from "react";
import { createUsePuck, useGetPuck } from "@puckeditor/core";
import { createBlockOperations } from "./block-operations";
import type { BlockOperationsPolicy } from "./config";

const usePuck = createUsePuck();

function BlockOperationsPanel({ policy }: { policy: BlockOperationsPolicy }) {
  // Subscribe to permission, selection, document, and undo/redo changes.
  usePuck((state) => state);
  const getPuck = useGetPuck();
  const operations = useMemo(() => createBlockOperations(getPuck, policy), [getPuck, policy]);
  const model = operations.model();
  const id = useId();
  const [destination, setDestination] = useState("root:sections");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const zone = model.destinations.find((item) => item.id === destination);
  const available = Boolean(zone?.types.some((item) => item.name === type));
  return (
    <div className="pm-block-operations-panel">
      <p>Add to the end of a slot, or move the selected block within its current slot.</p>
      <div className="pm-block-operations-add">
        <label htmlFor={`${id}-destination`}>Destination</label>
        <select
          id={`${id}-destination`}
          value={destination}
          onChange={(event) => setDestination(event.currentTarget.value)}
        >
          <option value="">Choose an editable destination</option>
          {!zone && destination && (
            <option value={destination}>Previous destination unavailable</option>
          )}
          {model.destinations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-block`}>Block</label>
        <select
          id={`${id}-block`}
          value={type}
          onChange={(event) => setType(event.currentTarget.value)}
        >
          <option value="">Choose an allowed block</option>
          {!available && type && <option value={type}>Previous block unavailable</option>}
          {zone?.types.map((item) => (
            <option key={item.name} value={item.name}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-disabled={!available}
          onClick={() => setStatus(operations.add(destination, type).message)}
        >
          Add block
        </button>
      </div>
      <p>
        {model.selected
          ? `Selected: ${model.selected.label}`
          : "Select a block in Outline to move it."}
      </p>
      <div className="pm-block-operations-move">
        <button
          type="button"
          aria-disabled={!model.selected?.earlier}
          onClick={() => {
            if (model.selected) setStatus(operations.move(model.selected.id, -1).message);
          }}
        >
          Move earlier
        </button>
        <button
          type="button"
          aria-disabled={!model.selected?.later}
          onClick={() => {
            if (model.selected) setStatus(operations.move(model.selected.id, 1).message);
          }}
        >
          Move later
        </button>
      </div>
      {model.reason && <p>{model.reason}</p>}
      <p role="status" aria-live="polite" aria-atomic="true">
        {status}
      </p>
    </div>
  );
}

/** Mount the subscribed controller only while the user is using the panel. */
export function BlockOperations({ policy }: { policy: BlockOperationsPolicy }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="pm-block-operations"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Add or move blocks</summary>
      {open && <BlockOperationsPanel policy={policy} />}
    </details>
  );
}

/** Private to EmailEditor; custom Puck hosts are not granted this capability. */
export const BlockOperationsPolicyContext: Context<BlockOperationsPolicy | null> =
  createContext<BlockOperationsPolicy | null>(null);

/** Public Puck drawer wrapper; leave its native palette and drag handlers intact. */
export function BlockOperationsDrawer({ children }: { children: ReactNode }) {
  const policy = useContext(BlockOperationsPolicyContext);
  return (
    <>
      {policy && <BlockOperations policy={policy} />}
      {children}
    </>
  );
}
