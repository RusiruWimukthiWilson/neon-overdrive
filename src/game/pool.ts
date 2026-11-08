export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (item: T) => void;

  constructor(createFn: () => T, resetFn: (item: T) => void, initialSize: number = 50) {
    this.createFn = createFn;
    this.resetFn = resetFn;

    // Pre-allocate initial objects into memory
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }

  // Retrieve an recycled object (or create a new one if pool is empty)
  obtain(): T {
    const item = this.pool.pop() || this.createFn();
    this.resetFn(item);
    return item;
  }

  // Return an object back to the pool when dead
  release(item: T): void {
    this.pool.push(item);
  }
}