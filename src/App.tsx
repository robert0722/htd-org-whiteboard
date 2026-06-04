import {
  CircleDollarSign,
  Link2,
  LocateFixed,
  Plus,
  Save,
  Trash2,
  Users,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type CostType = "monthly" | "annual";

type PersonCard = {
  id: string;
  name: string;
  title: string;
  costType: CostType;
  costAmount: string;
  x: number;
  y: number;
};

type Connection = {
  id: string;
  fromId: string;
  toId: string;
};

type BoardState = {
  people: PersonCard[];
  connections: Connection[];
  zoom: number;
};

type DragState =
  | { type: "card"; id: string; offsetX: number; offsetY: number }
  | { type: "connector"; fromId: string; x: number; y: number }
  | null;

const STORAGE_KEY = "htd-org-whiteboard-v1";
const CARD_WIDTH = 236;
const CARD_HEIGHT = 142;

const starterPeople: PersonCard[] = [
  {
    id: "robert-roll",
    name: "Robert Roll",
    title: "EVP of HTD Talent",
    costType: "annual",
    costAmount: "",
    x: 520,
    y: 90
  },
  {
    id: "melanie-edwards",
    name: "Melanie Edwards",
    title: "Client Director at HTD Talent",
    costType: "annual",
    costAmount: "",
    x: 230,
    y: 320
  },
  {
    id: "sue-molina",
    name: "Sue Molina",
    title: "Operations Manager",
    costType: "annual",
    costAmount: "",
    x: 520,
    y: 320
  },
  {
    id: "lorens-laygo",
    name: "Lorens Laygo",
    title: "IT Sourcer",
    costType: "annual",
    costAmount: "",
    x: 810,
    y: 320
  },
  {
    id: "kristine-torreon",
    name: "Kristine Torreon",
    title: "IT Sourcer",
    costType: "annual",
    costAmount: "",
    x: 810,
    y: 540
  }
];

const starterState: BoardState = {
  people: starterPeople,
  connections: [
    { id: "robert-melanie", fromId: "robert-roll", toId: "melanie-edwards" },
    { id: "robert-sue", fromId: "robert-roll", toId: "sue-molina" },
    { id: "robert-lorens", fromId: "robert-roll", toId: "lorens-laygo" },
    { id: "lorens-kristine", fromId: "lorens-laygo", toId: "kristine-torreon" }
  ],
  zoom: 1
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function safeInitialState(): BoardState {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return starterState;
  }

  try {
    const parsed = JSON.parse(saved) as BoardState;
    if (!Array.isArray(parsed.people) || !Array.isArray(parsed.connections)) {
      return starterState;
    }
    return {
      people: parsed.people,
      connections: parsed.connections,
      zoom: parsed.zoom || 1
    };
  } catch {
    return starterState;
  }
}

function cardCenter(card: PersonCard) {
  return {
    x: card.x + CARD_WIDTH / 2,
    y: card.y + CARD_HEIGHT / 2
  };
}

function formatCost(person: PersonCard) {
  const numeric = Number(person.costAmount);
  if (!numeric) {
    return "Cost TBD";
  }
  return `${moneyFormatter.format(numeric)} / ${person.costType === "monthly" ? "mo" : "yr"}`;
}

function clampZoom(value: number) {
  return Math.min(1.4, Math.max(0.6, Number(value.toFixed(2))));
}

function boardSignature(board: BoardState) {
  return JSON.stringify(board);
}

export function App() {
  const [initialBoard] = useState<BoardState>(safeInitialState);
  const [board, setBoard] = useState<BoardState>(initialBoard);
  const [selectedId, setSelectedId] = useState(board.people[0]?.id ?? "");
  const [drag, setDrag] = useState<DragState>(null);
  const [savedSignature, setSavedSignature] = useState(boardSignature(initialBoard));
  const [saveStatus, setSaveStatus] = useState("All changes saved");
  const boardRef = useRef<HTMLDivElement | null>(null);

  const peopleById = useMemo(
    () => new Map(board.people.map((person) => [person.id, person])),
    [board.people]
  );

  const selectedPerson = peopleById.get(selectedId) ?? null;
  const selectedManagerId =
    board.connections.find((connection) => connection.toId === selectedId)
      ?.fromId ?? "";
  const hasUnsavedChanges = boardSignature(board) !== savedSignature;
  const totalCost = useMemo(
    () =>
      board.people.reduce(
        (totals, person) => {
          const amount = Number(person.costAmount);
          if (!amount) {
            return totals;
          }

          if (person.costType === "monthly") {
            return {
              annual: totals.annual + amount * 12,
              monthly: totals.monthly + amount
            };
          }

          return {
            annual: totals.annual + amount,
            monthly: totals.monthly + amount / 12
          };
        },
        { annual: 0, monthly: 0 }
      ),
    [board.people]
  );

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (saveStatus !== "Saved just now") {
      return;
    }

    const timeout = window.setTimeout(
      () => setSaveStatus("All changes saved"),
      1800
    );
    return () => window.clearTimeout(timeout);
  }, [saveStatus]);

  function saveBoard() {
    const nextSignature = boardSignature(board);
    window.localStorage.setItem(STORAGE_KEY, nextSignature);
    setSavedSignature(nextSignature);
    setSaveStatus("Saved just now");
  }

  function toBoardPoint(event: PointerEvent) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return {
      x: (event.clientX - rect.left) / board.zoom,
      y: (event.clientY - rect.top) / board.zoom
    };
  }

  function handleCardPointerDown(event: PointerEvent, person: PersonCard) {
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    const point = toBoardPoint(event);
    setSelectedId(person.id);
    setDrag({
      type: "card",
      id: person.id,
      offsetX: point.x - person.x,
      offsetY: point.y - person.y
    });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handleConnectorPointerDown(event: PointerEvent, fromId: string) {
    event.stopPropagation();
    const point = toBoardPoint(event);
    setSelectedId(fromId);
    setDrag({ type: "connector", fromId, x: point.x, y: point.y });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!drag) {
      return;
    }

    const point = toBoardPoint(event);
    if (drag.type === "card") {
      setBoard((current) => ({
        ...current,
        people: current.people.map((person) =>
          person.id === drag.id
            ? {
                ...person,
                x: Math.max(24, point.x - drag.offsetX),
                y: Math.max(24, point.y - drag.offsetY)
              }
            : person
        )
      }));
      return;
    }

    setDrag({ ...drag, x: point.x, y: point.y });
  }

  function handlePointerUp(event: PointerEvent) {
    if (drag?.type === "connector") {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest("[data-person-id]");
      const toId = target?.getAttribute("data-person-id");

      if (toId && toId !== drag.fromId) {
        const id = `${drag.fromId}-${toId}`;
        setBoard((current) => {
          const duplicate = current.connections.some(
            (connection) =>
              connection.fromId === drag.fromId && connection.toId === toId
          );

          if (duplicate) {
            return current;
          }

          return {
            ...current,
            connections: [
              ...current.connections.filter(
                (connection) => connection.toId !== toId
              ),
              {
                id,
                fromId: drag.fromId,
                toId
              }
            ]
          };
        });
      }
    }

    setDrag(null);
  }

  function updateSelectedPerson(updates: Partial<PersonCard>) {
    if (!selectedPerson) {
      return;
    }

    setBoard((current) => ({
      ...current,
      people: current.people.map((person) =>
        person.id === selectedPerson.id ? { ...person, ...updates } : person
      )
    }));
  }

  function updateSelectedManager(managerId: string) {
    if (!selectedPerson) {
      return;
    }

    setBoard((current) => ({
      ...current,
      connections: [
        ...current.connections.filter(
          (connection) => connection.toId !== selectedPerson.id
        ),
        ...(managerId
          ? [
              {
                id: `${managerId}-${selectedPerson.id}`,
                fromId: managerId,
                toId: selectedPerson.id
              }
            ]
          : [])
      ]
    }));
  }

  function addPerson() {
    const id = `person-${Date.now()}`;
    const person: PersonCard = {
      id,
      name: "New person",
      title: "Role title",
      costType: "annual",
      costAmount: "",
      x: 420 + board.people.length * 18,
      y: 220 + board.people.length * 18
    };

    setBoard((current) => ({
      ...current,
      people: [...current.people, person]
    }));
    setSelectedId(id);
  }

  function deleteSelected() {
    if (!selectedPerson) {
      return;
    }

    setBoard((current) => ({
      ...current,
      people: current.people.filter((person) => person.id !== selectedPerson.id),
      connections: current.connections.filter(
        (connection) =>
          connection.fromId !== selectedPerson.id &&
          connection.toId !== selectedPerson.id
      )
    }));
    setSelectedId("");
  }

  function fitView() {
    setBoard((current) => ({ ...current, zoom: 0.82 }));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-mark" src="/htd-logo-square.svg" alt="HTD Talent" />
          <div>
            <p>HTD Talent</p>
            <h1>Org Whiteboard</h1>
          </div>
        </div>
        <div className="toolbar" aria-label="Whiteboard controls">
          <button
            type="button"
            className={`save-action ${hasUnsavedChanges ? "needs-save" : ""}`}
            onClick={saveBoard}
          >
            <Save size={18} />
            Save
          </button>
          <span className={`save-status ${hasUnsavedChanges ? "unsaved" : ""}`}>
            {hasUnsavedChanges ? "Unsaved changes" : saveStatus}
          </span>
          <button type="button" className="primary-action" onClick={addPerson}>
            <Plus size={18} />
            Add person
          </button>
          <button type="button" onClick={deleteSelected} disabled={!selectedPerson}>
            <Trash2 size={18} />
            Delete
          </button>
          <span className="divider" />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() =>
              setBoard((current) => ({
                ...current,
                zoom: clampZoom(current.zoom - 0.1)
              }))
            }
          >
            <ZoomOut size={18} />
          </button>
          <span className="zoom-label">{Math.round(board.zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() =>
              setBoard((current) => ({
                ...current,
                zoom: clampZoom(current.zoom + 0.1)
              }))
            }
          >
            <ZoomIn size={18} />
          </button>
          <button type="button" onClick={fitView}>
            <LocateFixed size={18} />
            Fit
          </button>
        </div>
      </header>

      <main className="workspace">
        <section
          className="board-viewport"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          <div
            className="board"
            ref={boardRef}
            style={{
              transform: `scale(${board.zoom})`,
              width: `${1440 / board.zoom}px`,
              height: `${980 / board.zoom}px`
            }}
          >
            <svg className="connections" aria-hidden="true">
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" />
                </marker>
              </defs>
              {board.connections.map((connection) => {
                const from = peopleById.get(connection.fromId);
                const to = peopleById.get(connection.toId);
                if (!from || !to) {
                  return null;
                }

                const start = cardCenter(from);
                const end = cardCenter(to);
                const curve = Math.max(70, Math.abs(end.y - start.y) / 2);
                return (
                  <path
                    key={connection.id}
                    className="connection-line"
                    d={`M ${start.x} ${start.y + CARD_HEIGHT / 2 - 12} C ${start.x} ${start.y + curve}, ${end.x} ${end.y - curve}, ${end.x} ${end.y - CARD_HEIGHT / 2 + 12}`}
                    markerEnd="url(#arrowhead)"
                  />
                );
              })}
              {drag?.type === "connector" &&
                peopleById.get(drag.fromId) &&
                (() => {
                  const from = peopleById.get(drag.fromId)!;
                  const start = cardCenter(from);
                  return (
                    <path
                      className="connection-line draft"
                      d={`M ${start.x} ${start.y + CARD_HEIGHT / 2 - 12} C ${start.x} ${start.y + 90}, ${drag.x} ${drag.y - 90}, ${drag.x} ${drag.y}`}
                    />
                  );
                })()}
            </svg>

            {board.people.map((person) => (
              <article
                className={`person-card ${
                  selectedId === person.id ? "selected" : ""
                }`}
                data-person-id={person.id}
                key={person.id}
                onPointerDown={(event) => handleCardPointerDown(event, person)}
                style={{ left: person.x, top: person.y }}
              >
                <div className="card-header">
                  <div className="avatar">{person.name.slice(0, 1)}</div>
                  <button
                    type="button"
                    className="connector-handle"
                    aria-label={`Connect ${person.name}`}
                    title="Drag to another card to connect"
                    onPointerDown={(event) =>
                      handleConnectorPointerDown(event, person.id)
                    }
                  >
                    <Link2 size={16} />
                  </button>
                </div>
                <h2>{person.name}</h2>
                <p>{person.title}</p>
                <div className="cost-row">
                  <CircleDollarSign size={16} />
                  <span>{formatCost(person)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="inspector">
          <section className="cost-summary" aria-label="Total team cost">
            <div>
              <p>Total team cost</p>
              <h2>{moneyFormatter.format(totalCost.annual)} / yr</h2>
            </div>
            <span>{moneyFormatter.format(totalCost.monthly)} / mo</span>
          </section>
          <div className="panel-heading">
            <Users size={18} />
            <h2>Person Details</h2>
          </div>
          {selectedPerson ? (
            <form className="editor" onSubmit={(event) => event.preventDefault()}>
              <label>
                Name
                <input
                  value={selectedPerson.name}
                  onChange={(event) =>
                    updateSelectedPerson({ name: event.target.value })
                  }
                />
              </label>
              <label>
                Job title
                <input
                  value={selectedPerson.title}
                  onChange={(event) =>
                    updateSelectedPerson({ title: event.target.value })
                  }
                />
              </label>
              <label>
                Reports to
                <select
                  value={selectedManagerId}
                  onChange={(event) => updateSelectedManager(event.target.value)}
                >
                  <option value="">No manager</option>
                  {board.people
                    .filter((person) => person.id !== selectedPerson.id)
                    .map((person) => (
                      <option value={person.id} key={person.id}>
                        {person.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Cost amount
                <input
                  inputMode="numeric"
                  placeholder="e.g. 120000"
                  value={selectedPerson.costAmount}
                  onChange={(event) =>
                    updateSelectedPerson({
                      costAmount: event.target.value.replace(/[^\d.]/g, "")
                    })
                  }
                />
              </label>
              <label>
                Cost cadence
                <select
                  value={selectedPerson.costType}
                  onChange={(event) =>
                    updateSelectedPerson({
                      costType: event.target.value as CostType
                    })
                  }
                >
                  <option value="annual">Annual</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <button type="button" className="danger-action" onClick={deleteSelected}>
                <Trash2 size={18} />
                Delete selected person
              </button>
            </form>
          ) : (
            <div className="empty-panel">
              <p>Select a person card to edit details.</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
