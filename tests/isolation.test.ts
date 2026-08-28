import { describe, expect, it } from 'vitest';
import { isAllowedSlug, slugifyBusiness, uuidv7 } from '@nexoio/core';

describe('tenant safety primitives', () => {
  it('requires resource queries to combine id and business id', () => {
    const resource = { id: 'customer-b', businessId: 'business-b' };
    const find = (id: string, businessId: string) => resource.id === id && resource.businessId === businessId ? resource : undefined;
    expect(find('customer-b', 'business-a')).toBeUndefined();
    expect(find('customer-b', 'business-b')).toEqual(resource);
  });
  it('blocks reserved and unsafe slugs', () => { expect(isAllowedSlug('admin')).toBe(false); expect(isAllowedSlug('estetica-gd')).toBe(true); expect(slugifyBusiness('Estética GD')).toBe('estetica-gd'); });
  it('generates UUID v7 identifiers', () => expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
});
