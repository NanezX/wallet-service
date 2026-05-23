export type AccessTokenPayload = {
  sub?: string;
};

export type RequestUser = {
  userId?: string;
};

export type RequestWithUser = {
  user?: RequestUser;
};

export type RequestWithAuth = RequestWithUser & {
  headers: {
    authorization?: string;
  };
};
