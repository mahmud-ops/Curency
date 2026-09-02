import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
  const bkashIdTokenKey = "bkash:idToken";
  const bkashRefreshTokenKey = "bkash:refreshToken";

  // before fetching from the api, check if we already have the tokens in redis
  // if we have them, no need to fetch
  let bkashIdToken = await redisClient.get(bkashIdTokenKey);
  const bkashIdTokenTTL = await redisClient.ttl(bkashIdTokenKey);

  let bkashRefreshToken = await redisClient.get(bkashRefreshTokenKey);

  if (bkashIdToken) return bkashIdToken;

  // what if the id_token is expired but the refresh token is still in redis
  // we'll get a new id_token by fetching from the refresh url provided in the doc
  if (bkashIdTokenTTL <= 600 && bkashRefreshToken) {
    const refreshTokenResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/token/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          username: config.bkash_username,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
        }),
      },
    );

    const refreshTokenResult = await refreshTokenResponse.json();

    bkashIdToken = refreshTokenResult.id_token as string; // there'll a new token in the response ( source: doc )
    await redisClient.set(bkashIdTokenKey, bkashIdToken, {
      expiration: {
        type: "EX",
        value: 60 * 60,
      },
    });
    return bkashIdToken;
  }

  const response = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/token/grant`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        username: config.bkash_username,
        password: config.bkash_password,
      },
      body: JSON.stringify({
        app_key: config.bkash_app_key,
        app_secret: config.bkash_app_secret,
      }),
    },
  );

  const data = await response.json();

  await redisClient.set(bkashIdTokenKey, data.id_token, {
    expiration: {
      type: "EX",
      value: 60 * 60,
    },
  });

  await redisClient.set(bkashRefreshTokenKey, data.refresh_token, {
    expiration: {
      type: "EX",
      value: 28 * 24 * 60 * 60,
    },
  });

  return data.id_token;
};
