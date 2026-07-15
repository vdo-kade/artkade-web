"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type StickerSelection = { id: string; name: string };

export type BagItem = {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  imageUrl?: string;
  stickerSelection?: StickerSelection[];
};

// Cart-line identity: normally just the variant, but a build-your-own
// sticker pack needs two different custom packs of the SAME variant to be
// separate lines (they contain different designs), while re-adding the
// identical selection should still merge quantity like any other item.
export function bagItemKey(item: Pick<BagItem, "variantId" | "stickerSelection">): string {
  if (!item.stickerSelection || item.stickerSelection.length === 0) return item.variantId;
  const sortedIds = item.stickerSelection.map((d) => d.id).sort().join(",");
  return `${item.variantId}::${sortedIds}`;
}

type BagContextValue = {
  items: BagItem[];
  addItem: (item: Omit<BagItem, "quantity">, quantity?: number) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clear: () => void;
  totalItems: number;
  totalAmount: number;
};

const BagContext = createContext<BagContextValue | undefined>(undefined);
const STORAGE_KEY = "artkade-bag";

export function BagProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BagItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage once on mount (can't read it during SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // corrupt/blocked storage -- fall back to an empty bag
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  function addItem(item: Omit<BagItem, "quantity">, quantity = 1) {
    setItems((prev) => {
      const key = bagItemKey(item);
      const existing = prev.find((i) => bagItemKey(i) === key);
      if (existing) {
        return prev.map((i) =>
          bagItemKey(i) === key ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, { ...item, quantity }];
    });
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => bagItemKey(i) !== key));
  }

  function updateQuantity(key: string, quantity: number) {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => bagItemKey(i) !== key)
        : prev.map((i) => (bagItemKey(i) === key ? { ...i, quantity } : i))
    );
  }

  function clear() {
    setItems([]);
  }

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  return (
    <BagContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clear, totalItems, totalAmount }}
    >
      {children}
    </BagContext.Provider>
  );
}

export function useBag() {
  const ctx = useContext(BagContext);
  if (!ctx) throw new Error("useBag must be used within a BagProvider");
  return ctx;
}
