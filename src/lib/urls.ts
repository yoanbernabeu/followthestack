const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

export const url = {
  home: () => base,
  product: (id: string) => `${base}product/${id}/`,
  entity: (id: string) => `${base}entity/${id}/`,
  grievance: (id: string) => `${base}grievance/${id}/`,
  category: (id: string) => `${base}category/${id}/`,
  linkType: (id: string) => `${base}about/#link-${id}`,
  contribute: (params: Record<string, string> = {}) => `${base}contribute/${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`,
};
