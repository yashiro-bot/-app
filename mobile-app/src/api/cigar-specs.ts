// CigarSpec catalog API.
//
// Endpoint (backend reference: backend/src/routes/cigar-specs.ts):
//   GET /cigar-specs         — flat list of every active CigarSpec
//                              (sortOrder asc, with derived totalInUse count)
//   GET /cigar-specs/categories — distinct category strings (T26 admin UI)
//   GET /cigar-specs/:id     — single spec
//
// The mobile app uses GET /cigar-specs to render the collect page's
// SKU grid (45 rows in dev, grouped by category). The response is
// cached in memory by the page itself for the lifetime of the visit
// — there is no offline catalog sync (we only support offline drafts
// of *filled-in* collections, not the catalog).

import { http } from '../utils/request';

export interface CigarSpec {
  id: number;
  code: string;
  name: string;
  category: string;
  unitPerBox: number;
  sortOrder: number;
  status: 'ACTIVE' | 'DISABLED';
  /** Derived server-side count of CollectionDetail rows that reference this
   *  spec. Returned by the backend but not used by the collect page. */
  totalInUse: number;
}

export async function listCigarSpecs(): Promise<CigarSpec[]> {
  const res = await http.get('/cigar-specs');
  return res.data;
}