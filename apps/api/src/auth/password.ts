import argon2 from "argon2";

export const hashPassword = async (password: string): Promise<string> =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });

export const verifyPassword = async (
  hash: string,
  password: string
): Promise<boolean> => argon2.verify(hash, password);
