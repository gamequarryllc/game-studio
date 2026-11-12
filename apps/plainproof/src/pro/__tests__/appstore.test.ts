// The App Store adapter, against a stand-in for expo-iap. Real purchases only run on an iPhone;
// this pins down what the adapter does with each thing the store can answer.

const PRODUCT = 'com.gamequarry.plainproof.pro';

type Listener = (payload: unknown) => void;

function fakeStore() {
  const listeners: { updated: Listener[]; error: Listener[] } = { updated: [], error: [] };
  const store = {
    ErrorCode: { UserCancelled: 'user-cancelled', Pending: 'pending', DeferredPayment: 'deferred-payment' },
    initConnection: jest.fn(async () => true),
    purchaseUpdatedListener: jest.fn((l: Listener) => (listeners.updated.push(l), { remove: () => {} })),
    purchaseErrorListener: jest.fn((l: Listener) => (listeners.error.push(l), { remove: () => {} })),
    getAvailablePurchases: jest.fn(async (): Promise<unknown[]> => []),
    fetchProducts: jest.fn(async (): Promise<unknown[] | null> => [{ id: PRODUCT, displayPrice: '$5.99' }]),
    requestPurchase: jest.fn(async (): Promise<unknown> => null),
    finishTransaction: jest.fn(async () => {}),
    restorePurchases: jest.fn(async () => {}),
  };
  return {
    store,
    emitPurchase: (p: unknown) => listeners.updated.forEach((l) => l(p)),
    emitError: (e: unknown) => listeners.error.forEach((l) => l(e)),
  };
}

const bought = { productId: PRODUCT, purchaseState: 'purchased', transactionId: '1' };

function load(fake: ReturnType<typeof fakeStore>) {
  jest.resetModules();
  jest.doMock('expo-iap', () => fake.store, { virtual: true });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../appstore') as typeof import('../appstore');
}

const tick = () => new Promise<void>((r) => setImmediate(() => r()));

afterEach(() => {
  jest.clearAllTimers();
});

describe('starting the store', () => {
  it('reads what is owned and the price from the App Store', async () => {
    const fake = fakeStore();
    fake.store.getAvailablePurchases.mockResolvedValue([bought]);
    const store = load(fake);
    await expect(store.startStore(() => {})).resolves.toEqual({ owned: true, price: '$5.99' });
    expect(fake.store.getAvailablePurchases).toHaveBeenCalledWith({ onlyIncludeActiveItemsIOS: true });
  });

  it('does not count another product or a purchase still waiting for approval', async () => {
    const fake = fakeStore();
    fake.store.getAvailablePurchases.mockResolvedValue([
      { productId: 'com.example.other', purchaseState: 'purchased' },
      { productId: PRODUCT, purchaseState: 'pending' },
    ]);
    const store = load(fake);
    await expect(store.startStore(() => {})).resolves.toEqual({ owned: false, price: '$5.99' });
  });

  it('says it could not tell, rather than "not owned", when the iPhone cannot answer', async () => {
    const fake = fakeStore();
    fake.store.getAvailablePurchases.mockRejectedValue(new Error('no'));
    fake.store.fetchProducts.mockRejectedValueOnce(new Error('offline'));
    const store = load(fake);
    await expect(store.startStore(() => {})).resolves.toEqual({ owned: null, price: null });
    // The price is read again later.
    await expect(store.readPrice()).resolves.toBe('$5.99');
  });
});

describe('buying', () => {
  it('unlocks when the App Store reports the purchase, and finishes the transaction', async () => {
    const fake = fakeStore();
    const store = load(fake);
    const owned = jest.fn();
    await store.startStore(owned);
    const result = store.buy();
    await tick();
    expect(fake.store.requestPurchase).toHaveBeenCalledWith({ request: { apple: { sku: PRODUCT } }, type: 'in-app' });
    fake.emitPurchase(bought);
    await expect(result).resolves.toBe('purchased');
    expect(fake.store.finishTransaction).toHaveBeenCalledWith({ purchase: bought, isConsumable: false });
    expect(owned).toHaveBeenCalledWith(true);
  });

  it('unlocks when the purchase comes back from the request itself', async () => {
    const fake = fakeStore();
    fake.store.requestPurchase.mockResolvedValue(bought);
    const store = load(fake);
    await store.startStore(() => {});
    await expect(store.buy()).resolves.toBe('purchased');
  });

  it('reports a cancelled sheet as cancelled', async () => {
    const fake = fakeStore();
    const store = load(fake);
    const owned = jest.fn();
    await store.startStore(owned);
    const result = store.buy();
    await tick();
    fake.emitError({ code: 'user-cancelled', message: 'cancelled' });
    await expect(result).resolves.toBe('cancelled');
    expect(owned).not.toHaveBeenCalled();
  });

  it('reports Ask to Buy as pending, and unlocks later when the approval arrives', async () => {
    const fake = fakeStore();
    const store = load(fake);
    const owned = jest.fn();
    await store.startStore(owned);
    const result = store.buy();
    await tick();
    fake.emitPurchase({ ...bought, purchaseState: 'pending' });
    await expect(result).resolves.toBe('pending');
    expect(owned).not.toHaveBeenCalled();
    fake.emitPurchase(bought); // approved, perhaps days later
    await tick();
    expect(owned).toHaveBeenCalledWith(true);
  });

  it('reports any other store error as failed', async () => {
    const fake = fakeStore();
    fake.store.requestPurchase.mockRejectedValue({ code: 'network-error' });
    const store = load(fake);
    await store.startStore(() => {});
    await expect(store.buy()).resolves.toBe('failed');
  });

  it('does not open a purchase for a product the App Store did not offer', async () => {
    const fake = fakeStore();
    fake.store.fetchProducts.mockResolvedValue([]);
    const store = load(fake);
    await expect(store.startStore(() => {})).resolves.toEqual({ owned: false, price: null });
    await expect(store.buy()).resolves.toBe('unavailable');
    expect(fake.store.requestPurchase).not.toHaveBeenCalled();
  });

  it('asks what is owned if the sheet closes and no result ever arrives', async () => {
    jest.useFakeTimers();
    try {
      const fake = fakeStore();
      const store = load(fake);
      const owned = jest.fn();
      await store.startStore(owned);
      const result = store.buy();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      fake.store.getAvailablePurchases.mockResolvedValue([bought]);
      await jest.advanceTimersByTimeAsync(3000);
      await expect(result).resolves.toBe('purchased');
      expect(owned).toHaveBeenCalledWith(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a purchase of some other product', async () => {
    const fake = fakeStore();
    const store = load(fake);
    const owned = jest.fn();
    await store.startStore(owned);
    fake.emitPurchase({ productId: 'com.example.other', purchaseState: 'purchased' });
    await tick();
    expect(owned).not.toHaveBeenCalled();
    expect(fake.store.finishTransaction).not.toHaveBeenCalled();
  });
});

describe('restoring', () => {
  it('brings Pro back when the Apple Account holds it', async () => {
    const fake = fakeStore();
    const store = load(fake);
    const owned = jest.fn();
    await store.startStore(owned);
    fake.store.getAvailablePurchases.mockResolvedValue([bought]);
    await expect(store.restore()).resolves.toBe('restored');
    expect(fake.store.restorePurchases).toHaveBeenCalled();
    expect(owned).toHaveBeenCalledWith(true);
  });

  it('says so when there is nothing to restore', async () => {
    const fake = fakeStore();
    const store = load(fake);
    await store.startStore(() => {});
    await expect(store.restore()).resolves.toBe('nothing');
  });

  it('does not say "nothing" when the App Store could not be asked', async () => {
    const fake = fakeStore();
    const store = load(fake);
    await store.startStore(() => {});
    fake.store.restorePurchases.mockRejectedValue(new Error('offline'));
    await expect(store.restore()).resolves.toBe('failed');
  });

  it('still restores from what the iPhone already knows when the App Store cannot be asked', async () => {
    const fake = fakeStore();
    const store = load(fake);
    await store.startStore(() => {});
    fake.store.restorePurchases.mockRejectedValue(new Error('offline'));
    fake.store.getAvailablePurchases.mockResolvedValue([bought]);
    await expect(store.restore()).resolves.toBe('restored');
  });
});
