// Shop inventory shared by Tủ đồ (Gợi ý mua) and Phối đồ: loaded once per app run.
import { api } from './api';
import type { Product, ProductPick } from './types';

let products: Product[] | null = null;
let catalogRequest: Promise<Product[]> | null = null;
const picks = new Map<string, ProductPick[]>();
const pickRequests = new Map<string, Promise<ProductPick[]>>();

export async function loadCatalog(force = false): Promise<Product[]> {
  if (catalogRequest) return catalogRequest;
  if (products && !force) return products;
  const request = api.catalogList().then(({ products: loaded }) => {
    products = loaded;
    return loaded;
  });
  catalogRequest = request;
  const clear = () => { if (catalogRequest === request) catalogRequest = null; };
  void request.then(clear, clear);
  return request;
}

export async function loadPicks(force = false, cacheKey = 'default'): Promise<ProductPick[]> {
  const pending = pickRequests.get(cacheKey);
  if (pending) return pending;
  const cached = picks.get(cacheKey);
  if (cached && !force) return cached;
  const request = api.catalogPick().then(({ picks: loaded }) => {
    picks.set(cacheKey, loaded);
    return loaded;
  });
  pickRequests.set(cacheKey, request);
  const clear = () => { if (pickRequests.get(cacheKey) === request) pickRequests.delete(cacheKey); };
  void request.then(clear, clear);
  return request;
}

export const cachedCatalog = () => products ?? [];
export const cachedPicks = (cacheKey = 'default') => picks.get(cacheKey) ?? [];

// "Phối thử" in Gợi ý mua queues a product; Phối đồ takes it into the outfit when it opens.
let studioQueue: string[] = [];
export const queueStudioPick = (id: string) => { studioQueue = [...studioQueue.filter((x) => x !== id), id]; };
export const takeStudioPicks = () => { const q = studioQueue; studioQueue = []; return q; };
