// Shop inventory shared by Tủ đồ (Gợi ý mua) and Phối đồ: loaded once per app run.
import { api } from './api';
import type { Product, ProductPick } from './types';

let products: Product[] | null = null;
let picks: ProductPick[] | null = null;

export async function loadCatalog(force = false): Promise<Product[]> {
  if (!products || force) products = (await api.catalogList()).products;
  return products;
}

export async function loadPicks(force = false): Promise<ProductPick[]> {
  if (!picks || force) picks = (await api.catalogPick()).picks;
  return picks;
}

export const cachedCatalog = () => products ?? [];
export const cachedPicks = () => picks ?? [];

// "Phối thử" in Gợi ý mua queues a product; Phối đồ takes it into the outfit when it opens.
let studioQueue: string[] = [];
export const queueStudioPick = (id: string) => { studioQueue = [...studioQueue.filter((x) => x !== id), id]; };
export const takeStudioPicks = () => { const q = studioQueue; studioQueue = []; return q; };
