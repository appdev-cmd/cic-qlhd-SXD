export class PaginatedResult<T> {
  data!: T[];
  total!: number;
  skip!: number;
  take!: number;
}

export class PaginationQuery {
  skip?: number;
  take?: number;
}
