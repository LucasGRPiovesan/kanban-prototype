import { describe, expect, it } from 'vitest';
import { Uuid } from '../../src/shared/domain/identifier';
import { User } from '../../src/modules/iam/domain/user';

describe('User — exclusion and reactivation', () => {
  const excluded = () => {
    const user = User.create({ name: 'Ana Souza', roleUuid: Uuid.generate() });
    user.setActive(false);
    user.markDeleted(new Date());
    return user;
  };

  it('refuses to reactivate an excluded account before its exclusion is reverted', () => {
    const user = excluded();
    expect(() => user.setActive(true)).toThrow(expect.objectContaining({ code: 'USER_DELETED' }));
    expect(user.active).toBe(false);
  });

  it('still allows deactivating an excluded account, and reactivating once restored', () => {
    const user = excluded();
    expect(() => user.setActive(false)).not.toThrow();

    user.restore();
    expect(user.active).toBe(false);
    user.setActive(true);
    expect(user.active).toBe(true);
  });
});
