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

type BoardRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  state: BoardState;
};

type BoardsDocument = {
  version: 2;
  boards: BoardRecord[];
};

type DragState =
  | { type: "card"; id: string; offsetX: number; offsetY: number }
  | { type: "connector"; fromId: string; x: number; y: number }
  | null;

type ConfirmationState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
};

type WebKitGestureEvent = Event & {
  clientX: number;
  clientY: number;
  scale: number;
};

const LEGACY_STORAGE_KEY = "htd-org-whiteboard-v1";
const STORAGE_KEY = "htd-org-whiteboard-v2";
const LAST_ACTIVE_BOARD_KEY = "htd-org-whiteboard-active-board-v2";
const API_BASE_URL =
  import.meta.env.VITE_BOARD_API_URL || "https://htd-org-whiteboard-api.onrender.com";
const CARD_WIDTH = 236;
const CARD_HEIGHT = 142;
const DEFAULT_BOARD_NAME = "Untitled board";
const MAIN_BOARD_ID = "main-board";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function blankBoardState(): BoardState {
  return {
    people: [],
    connections: [],
    zoom: 1
  };
}

function cloneBoardState(board: BoardState): BoardState {
  return {
    people: board.people.map((person) => ({ ...person })),
    connections: board.connections.map((connection) => ({ ...connection })),
    zoom: board.zoom || 1
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBoardState(value: unknown): BoardState | null {
  if (!isObject(value)) {
    return null;
  }

  const people = Array.isArray(value.people) ? value.people : null;
  const connections = Array.isArray(value.connections) ? value.connections : null;
  const zoom = typeof value.zoom === "number" ? value.zoom : 1;

  if (!people || !connections) {
    return null;
  }

  return {
    people: people as PersonCard[],
    connections: connections as Connection[],
    zoom
  };
}

function normalizeBoardName(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_BOARD_NAME;
  }

  const trimmed = value.trim();
  return trimmed || DEFAULT_BOARD_NAME;
}

function normalizeBoardRecord(value: unknown, fallbackId: string): BoardRecord | null {
  if (!isObject(value)) {
    return null;
  }

  const state = normalizeBoardState(value.state);
  const id =
    typeof value.id === "string" && value.id.trim()
      ? value.id.trim()
      : fallbackId;

  if (!state || !id) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id,
    name: normalizeBoardName(value.name),
    createdAt:
      typeof value.createdAt === "string" && value.createdAt
        ? value.createdAt
        : now,
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt
        ? value.updatedAt
        : now,
    state
  };
}

function toBoardsDocument(value: unknown): BoardsDocument {
  if (isObject(value) && value.version === 2 && Array.isArray(value.boards)) {
    return {
      version: 2,
      boards: value.boards
        .map((board, index) => normalizeBoardRecord(board, `board-${index + 1}`))
        .filter((board): board is BoardRecord => Boolean(board))
    };
  }

  const legacyBoard = normalizeBoardState(value);
  if (legacyBoard) {
    const now = new Date().toISOString();
    return {
      version: 2,
      boards: [
        {
          id: MAIN_BOARD_ID,
          name: "Main Board",
          createdAt: now,
          updatedAt: now,
          state: legacyBoard
        }
      ]
    };
  }

  return {
    version: 2,
    boards: []
  };
}

function safeInitialDocument(): BoardsDocument {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return toBoardsDocument(JSON.parse(saved));
    } catch {
      // Fall through to legacy storage.
    }
  }

  const legacySaved = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacySaved) {
    try {
      return toBoardsDocument(JSON.parse(legacySaved));
    } catch {
      return { version: 2, boards: [] };
    }
  }

  return {
    version: 2,
    boards: []
  };
}

function chooseInitialBoardId(boards: BoardRecord[]) {
  const lastActiveId = window.localStorage.getItem(LAST_ACTIVE_BOARD_KEY);
  if (lastActiveId && boards.some((board) => board.id === lastActiveId)) {
    return lastActiveId;
  }

  return boards[0]?.id ?? "";
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

function boardRecordSignature(name: string, state: BoardState) {
  return JSON.stringify({
    name: normalizeBoardName(name),
    state
  });
}

function signaturesFromBoards(boards: BoardRecord[]) {
  return boards.reduce<Record<string, string>>((signatures, board) => {
    signatures[board.id] = boardRecordSignature(board.name, board.state);
    return signatures;
  }, {});
}

function upsertBoard(boards: BoardRecord[], board: BoardRecord) {
  return [
    ...boards.filter((entry) => entry.id !== board.id),
    board
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function writeLocalBoards(boards: BoardRecord[]) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      boards
    })
  );
}

async function loadLegacyCloudBoard() {
  const response = await fetchWithRetry(`${API_BASE_URL}/api/board`);
  if (!response.ok) {
    throw new Error("Could not load shared board");
  }

  const payload = (await response.json()) as { board: BoardState | null };
  if (!payload.board) {
    return {
      version: 2,
      boards: []
    };
  }

  return toBoardsDocument(payload.board);
}

async function loadCloudBoards() {
  const response = await fetchWithRetry(`${API_BASE_URL}/api/boards`);
  if (response.status === 404) {
    return loadLegacyCloudBoard();
  }

  if (!response.ok) {
    throw new Error("Could not load shared boards");
  }

  const payload = (await response.json()) as unknown;
  return toBoardsDocument(payload);
}

async function saveCloudBoard(board: BoardRecord) {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/boards/${encodeURIComponent(board.id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board)
    }
  );

  if (!response.ok) {
    throw new Error("Could not save shared board");
  }

  const payload = (await response.json()) as { board?: unknown };
  return normalizeBoardRecord(payload.board, board.id) ?? board;
}

async function deleteCloudBoard(id: string) {
  const response = await fetchWithRetry(
    `${API_BASE_URL}/api/boards/${encodeURIComponent(id)}`,
    {
      method: "DELETE"
    }
  );

  if (!response.ok) {
    throw new Error("Could not delete shared board");
  }

  const payload = (await response.json()) as { boards?: unknown };
  if (Array.isArray(payload.boards)) {
    return payload.boards
      .map((board, index) => normalizeBoardRecord(board, `board-${index + 1}`))
      .filter((board): board is BoardRecord => Boolean(board));
  }

  return null;
}

async function fetchWithRetry(url: string, options?: RequestInit) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.status !== 404 || attempt === 3) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === 3) {
        throw error;
      }
    }

    await new Promise((resolve) =>
      window.setTimeout(resolve, 900 * (attempt + 1))
    );
  }

  throw lastError ?? new Error("Request failed");
}

export function App() {
  const [initialDocument] = useState<BoardsDocument>(safeInitialDocument);
  const [boards, setBoards] = useState<BoardRecord[]>(initialDocument.boards);
  const [savedSignatures, setSavedSignatures] = useState<Record<string, string>>(
    () => signaturesFromBoards(initialDocument.boards)
  );
  const [activeBoardId, setActiveBoardId] = useState(() =>
    chooseInitialBoardId(initialDocument.boards)
  );
  const initialActiveBoard =
    initialDocument.boards.find((board) => board.id === activeBoardId) ?? null;
  const [board, setBoard] = useState<BoardState>(() =>
    initialActiveBoard ? cloneBoardState(initialActiveBoard.state) : blankBoardState()
  );
  const [boardName, setBoardName] = useState(
    initialActiveBoard?.name ?? DEFAULT_BOARD_NAME
  );
  const [selectedId, setSelectedId] = useState(
    initialActiveBoard?.state.people[0]?.id ?? ""
  );
  const [drag, setDrag] = useState<DragState>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [saveStatus, setSaveStatus] = useState(
    initialDocument.boards.length ? "Loading shared boards" : "No boards yet"
  );
  const [isSaving, setIsSaving] = useState(false);
  const viewportRef = useRef<HTMLElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardZoomRef = useRef(board.zoom);
  const gestureStartZoomRef = useRef(board.zoom);

  const activeBoard = boards.find((entry) => entry.id === activeBoardId) ?? null;
  const activeSignature = boardRecordSignature(boardName, board);
  const savedSignature = activeBoardId ? savedSignatures[activeBoardId] ?? "" : "";
  const hasUnsavedChanges =
    Boolean(activeBoardId) && activeSignature !== savedSignature;
  const hasBoards = boards.length > 0;

  const displayedBoards = useMemo(
    () =>
      boards.map((entry) =>
        entry.id === activeBoardId
          ? {
              ...entry,
              name: boardName
            }
          : entry
      ),
    [activeBoardId, boardName, boards]
  );

  const peopleById = useMemo(
    () => new Map(board.people.map((person) => [person.id, person])),
    [board.people]
  );

  const selectedPerson = peopleById.get(selectedId) ?? null;
  const selectedManagerId =
    board.connections.find((connection) => connection.toId === selectedId)
      ?.fromId ?? "";
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

  function activateBoard(record: BoardRecord | null, status?: string) {
    setDrag(null);

    if (!record) {
      setActiveBoardId("");
      setBoardName(DEFAULT_BOARD_NAME);
      setBoard(blankBoardState());
      setSelectedId("");
      window.localStorage.removeItem(LAST_ACTIVE_BOARD_KEY);
      setSaveStatus(status ?? "No boards yet");
      return;
    }

    setActiveBoardId(record.id);
    setBoardName(record.name);
    setBoard(cloneBoardState(record.state));
    setSelectedId(record.state.people[0]?.id ?? "");
    window.localStorage.setItem(LAST_ACTIVE_BOARD_KEY, record.id);
    setSaveStatus(status ?? "All changes saved");
  }

  function discardUnsavedNewBoard(nextBoards: BoardRecord[]) {
    if (!activeBoardId || savedSignatures[activeBoardId]) {
      return nextBoards;
    }

    return nextBoards.filter((entry) => entry.id !== activeBoardId);
  }

  function afterDiscardConfirmation(action: () => void) {
    if (!hasUnsavedChanges) {
      action();
      return;
    }

    setConfirmation({
      title: "Discard unsaved changes?",
      message: "Your current board edits have not been saved.",
      confirmLabel: "Discard changes",
      tone: "danger",
      onConfirm: action
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrateBoards() {
      try {
        const cloudDocument = await loadCloudBoards();
        if (cancelled) {
          return;
        }

        if (cloudDocument.boards.length) {
          const nextId = chooseInitialBoardId(cloudDocument.boards);
          const nextBoard =
            cloudDocument.boards.find((entry) => entry.id === nextId) ??
            cloudDocument.boards[0];

          setBoards(cloudDocument.boards);
          setSavedSignatures(signaturesFromBoards(cloudDocument.boards));
          writeLocalBoards(cloudDocument.boards);
          activateBoard(nextBoard);
          return;
        }

        if (initialDocument.boards.length) {
          const nextId = chooseInitialBoardId(initialDocument.boards);
          setBoards(initialDocument.boards);
          setSavedSignatures(signaturesFromBoards(initialDocument.boards));
          activateBoard(
            initialDocument.boards.find((entry) => entry.id === nextId) ??
              initialDocument.boards[0],
            "Local boards only"
          );
          return;
        }

        setBoards([]);
        setSavedSignatures({});
        activateBoard(null);
      } catch {
        if (!cancelled) {
          if (initialDocument.boards.length) {
            const nextId = chooseInitialBoardId(initialDocument.boards);
            setBoards(initialDocument.boards);
            setSavedSignatures(signaturesFromBoards(initialDocument.boards));
            activateBoard(
              initialDocument.boards.find((entry) => entry.id === nextId) ??
                initialDocument.boards[0],
              "Offline: local boards only"
            );
            return;
          }

          setSaveStatus("Offline: no boards loaded");
        }
      }
    }

    hydrateBoards();

    return () => {
      cancelled = true;
    };
  }, [initialDocument]);

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
    if (hasUnsavedChanges || !activeBoardId) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const cloudDocument = await loadCloudBoards();
        const nextSignatures = signaturesFromBoards(cloudDocument.boards);
        const activeCloudBoard =
          cloudDocument.boards.find((entry) => entry.id === activeBoardId) ??
          null;

        setBoards(cloudDocument.boards);
        setSavedSignatures(nextSignatures);
        writeLocalBoards(cloudDocument.boards);

        if (!activeCloudBoard) {
          activateBoard(cloudDocument.boards[0] ?? null, "Board deleted elsewhere");
          return;
        }

        const cloudSignature = boardRecordSignature(
          activeCloudBoard.name,
          activeCloudBoard.state
        );

        if (cloudSignature !== savedSignature) {
          activateBoard(activeCloudBoard, "Synced latest board");
        }
      } catch {
        setSaveStatus("Sync paused");
      }
    }, 6000);

    return () => window.clearInterval(interval);
  }, [activeBoardId, hasUnsavedChanges, savedSignature]);

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

  useEffect(() => {
    boardZoomRef.current = board.zoom;
  }, [board.zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleWheel = (event: globalThis.WheelEvent) => {
      if (!activeBoardId || (!event.ctrlKey && !event.metaKey)) {
        return;
      }

      event.preventDefault();
      const currentZoom = boardZoomRef.current;
      updateZoom(currentZoom * Math.exp(-event.deltaY * 0.002), {
        clientX: event.clientX,
        clientY: event.clientY
      }, currentZoom);
    };

    const handleGestureStart = (event: Event) => {
      if (!activeBoardId) {
        return;
      }

      event.preventDefault();
      gestureStartZoomRef.current = boardZoomRef.current;
    };

    const handleGestureChange = (event: Event) => {
      if (!activeBoardId) {
        return;
      }

      event.preventDefault();
      const gestureEvent = event as WebKitGestureEvent;
      updateZoom(gestureStartZoomRef.current * gestureEvent.scale, {
        clientX: gestureEvent.clientX,
        clientY: gestureEvent.clientY
      }, boardZoomRef.current);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    viewport.addEventListener("gesturestart", handleGestureStart, {
      passive: false
    });
    viewport.addEventListener("gesturechange", handleGestureChange, {
      passive: false
    });

    return () => {
      viewport.removeEventListener("wheel", handleWheel);
      viewport.removeEventListener("gesturestart", handleGestureStart);
      viewport.removeEventListener("gesturechange", handleGestureChange);
    };
  }, [activeBoardId]);

  async function saveBoard() {
    if (!activeBoardId) {
      return;
    }

    const now = new Date().toISOString();
    const draftRecord: BoardRecord = {
      id: activeBoardId,
      name: normalizeBoardName(boardName),
      createdAt: activeBoard?.createdAt ?? now,
      updatedAt: activeBoard?.updatedAt ?? now,
      state: cloneBoardState(board)
    };

    setIsSaving(true);
    setSaveStatus("Saving");
    try {
      const savedBoard = await saveCloudBoard(draftRecord);
      const nextBoards = upsertBoard(boards, savedBoard);

      setBoards(nextBoards);
      setBoardName(savedBoard.name);
      setBoard(cloneBoardState(savedBoard.state));
      setSavedSignatures(signaturesFromBoards(nextBoards));
      writeLocalBoards(nextBoards);
      window.localStorage.setItem(LAST_ACTIVE_BOARD_KEY, savedBoard.id);
      setSaveStatus("Saved just now");
    } catch {
      writeLocalBoards(upsertBoard(boards, draftRecord));
      setSaveStatus("Cloud save failed");
    } finally {
      setIsSaving(false);
    }
  }

  function switchBoard(nextBoardId: string) {
    if (!nextBoardId || nextBoardId === activeBoardId) {
      return;
    }

    afterDiscardConfirmation(() => {
      const nextBoards = discardUnsavedNewBoard(boards);
      const nextBoard = nextBoards.find((entry) => entry.id === nextBoardId);
      if (!nextBoard) {
        return;
      }

      setBoards(nextBoards);
      writeLocalBoards(nextBoards);
      activateBoard(nextBoard);
    });
  }

  function createBoard() {
    afterDiscardConfirmation(() => {
      const now = new Date().toISOString();
      const nextBoards = discardUnsavedNewBoard(boards);
      const newBoard: BoardRecord = {
        id: `board-${Date.now()}`,
        name: DEFAULT_BOARD_NAME,
        createdAt: now,
        updatedAt: now,
        state: blankBoardState()
      };

      setBoards([...nextBoards, newBoard]);
      activateBoard(newBoard, "New board ready to save");
    });
  }

  function deleteBoard() {
    if (!activeBoardId) {
      return;
    }

    setConfirmation({
      title: "Delete board?",
      message: `"${normalizeBoardName(boardName)}" will be removed for everyone.`,
      confirmLabel: "Delete board",
      tone: "danger",
      onConfirm: deleteActiveBoard
    });
  }

  async function deleteActiveBoard() {
    const nextLocalBoards = boards.filter((entry) => entry.id !== activeBoardId);
    const nextActiveBoard = nextLocalBoards[0] ?? null;

    if (!savedSignatures[activeBoardId]) {
      setBoards(nextLocalBoards);
      writeLocalBoards(nextLocalBoards);
      activateBoard(nextActiveBoard, nextActiveBoard ? "Board deleted" : "No boards yet");
      return;
    }

    setIsSaving(true);
    setSaveStatus("Deleting board");
    try {
      const cloudBoards = await deleteCloudBoard(activeBoardId);
      const nextBoards = cloudBoards ?? nextLocalBoards;
      const nextSignatures = signaturesFromBoards(nextBoards);
      const nextBoard =
        nextBoards.find((entry) => entry.id === nextActiveBoard?.id) ??
        nextBoards[0] ??
        null;

      setBoards(nextBoards);
      setSavedSignatures(nextSignatures);
      writeLocalBoards(nextBoards);
      activateBoard(nextBoard, nextBoard ? "Board deleted" : "No boards yet");
    } catch {
      setSaveStatus("Delete failed");
    } finally {
      setIsSaving(false);
    }
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
    if (!drag || !activeBoardId) {
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

  function updateZoom(
    nextZoom: number,
    anchor?: { clientX: number; clientY: number },
    sourceZoom = board.zoom
  ) {
    if (!activeBoardId) {
      return;
    }

    const viewport = viewportRef.current;
    const boardElement = boardRef.current;
    const zoom = clampZoom(nextZoom);

    if (!anchor || !viewport || !boardElement) {
      setBoard((current) => ({ ...current, zoom }));
      return;
    }

    const boardRect = boardElement.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const boardX = (anchor.clientX - boardRect.left) / sourceZoom;
    const boardY = (anchor.clientY - boardRect.top) / sourceZoom;
    const viewportX = anchor.clientX - viewportRect.left;
    const viewportY = anchor.clientY - viewportRect.top;

    boardZoomRef.current = zoom;
    setBoard((current) => ({ ...current, zoom }));

    window.requestAnimationFrame(() => {
      viewport.scrollLeft = boardX * zoom - viewportX;
      viewport.scrollTop = boardY * zoom - viewportY;
    });
  }

  function updateSelectedPerson(updates: Partial<PersonCard>) {
    if (!selectedPerson || !activeBoardId) {
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
    if (!selectedPerson || !activeBoardId) {
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
    if (!activeBoardId) {
      return;
    }

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
    if (!selectedPerson || !activeBoardId) {
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
    if (!activeBoardId) {
      return;
    }

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

        <div className="board-controls" aria-label="Board controls">
          <label className="board-select">
            <span>Board</span>
            <select
              value={activeBoardId}
              onChange={(event) => switchBoard(event.target.value)}
              disabled={!hasBoards || isSaving}
            >
              {!hasBoards && <option value="">No boards</option>}
              {displayedBoards.map((entry) => (
                <option value={entry.id} key={entry.id}>
                  {normalizeBoardName(entry.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="board-name">
            <span>Name</span>
            <input
              value={activeBoardId ? boardName : ""}
              onChange={(event) => setBoardName(event.target.value)}
              disabled={!activeBoardId || isSaving}
              placeholder={DEFAULT_BOARD_NAME}
            />
          </label>
          <button type="button" className="primary-action" onClick={createBoard}>
            <Plus size={18} />
            New board
          </button>
          <button
            type="button"
            className="topbar-danger"
            onClick={deleteBoard}
            disabled={!activeBoardId || isSaving}
          >
            <Trash2 size={18} />
            Delete board
          </button>
        </div>

        <div className="toolbar" aria-label="Whiteboard controls">
          <button
            type="button"
            className={`save-action ${hasUnsavedChanges ? "needs-save" : ""}`}
            onClick={saveBoard}
            disabled={!activeBoardId || isSaving}
          >
            <Save size={18} />
            {isSaving ? "Saving" : "Save"}
          </button>
          <span className={`save-status ${hasUnsavedChanges ? "unsaved" : ""}`}>
            {hasUnsavedChanges ? "Unsaved changes" : saveStatus}
          </span>
          <button
            type="button"
            className="primary-action"
            onClick={addPerson}
            disabled={!activeBoardId}
          >
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
            disabled={!activeBoardId}
            onClick={() => updateZoom(board.zoom - 0.1)}
          >
            <ZoomOut size={18} />
          </button>
          <span className="zoom-label">{Math.round(board.zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={!activeBoardId}
            onClick={() => updateZoom(board.zoom + 0.1)}
          >
            <ZoomIn size={18} />
          </button>
          <button type="button" onClick={fitView} disabled={!activeBoardId}>
            <LocateFixed size={18} />
            Fit
          </button>
        </div>
      </header>

      <main className="workspace">
        <section
          className="board-viewport"
          ref={viewportRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          {activeBoardId ? (
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
          ) : (
            <div className="board-empty-state">
              <h2>No boards yet</h2>
              <button type="button" className="primary-action" onClick={createBoard}>
                <Plus size={18} />
                New board
              </button>
            </div>
          )}
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
              <p>
                {activeBoardId
                  ? "Select a person card to edit details."
                  : "Create a board to start editing people."}
              </p>
            </div>
          )}
        </aside>
      </main>
      {confirmation && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="confirmation-title"
            aria-modal="true"
            className="confirmation-dialog"
            role="dialog"
          >
            <h2 id="confirmation-title">{confirmation.title}</h2>
            <p>{confirmation.message}</p>
            <div className="confirmation-actions">
              <button type="button" onClick={() => setConfirmation(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={
                  confirmation.tone === "danger"
                    ? "danger-confirm-action"
                    : "primary-action"
                }
                onClick={() => {
                  const action = confirmation.onConfirm;
                  setConfirmation(null);
                  void action();
                }}
              >
                {confirmation.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
