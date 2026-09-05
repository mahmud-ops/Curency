import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
  try {
    const bkashIdTokenKey = "bkash:idToken";
    const bkashRefreshTokenKey = "bkash:refreshToken";

    // 1. Fetch cached tokens & TTLs from Redis
    let bkashIdToken = await redisClient.get(bkashIdTokenKey);
    const bkashIdTokenTTL = await redisClient.ttl(bkashIdTokenKey);

    const bkashRefreshToken = await redisClient.get(bkashRefreshTokenKey);
    const bkashRefreshTokenTTL = await redisClient.ttl(bkashRefreshTokenKey);

    // 2. If ID token is expired/missing BUT refresh token is valid (> 10 mins remaining), refresh it
    if (
      (bkashIdTokenTTL <= 600 || !bkashIdToken) &&
      bkashRefreshToken &&
      bkashRefreshTokenTTL > 600
    ) {
      const refreshTokenResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/token/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            username: config.bkash_username,
            password: config.bkash_password,
          },
          body: JSON.stringify({
            app_key: config.bkash_app_key,
            app_secret: config.bkash_app_secret,
            refresh_token: bkashRefreshToken, // Included refresh_token
          }),
        },
      );

      if (!refreshTokenResponse.ok) {
        throw new Error("Bkash access token refresh failed");
      }

      const refreshTokenResult = await refreshTokenResponse.json();

      bkashIdToken = refreshTokenResult.id_token as string;

      await redisClient.set(bkashIdTokenKey, bkashIdToken, {
        expiration: {
          type: "EX",
          value: 60 * 60, // 1 hour
        },
      });

      return bkashIdToken;
    }

    // 3. If ID token is still valid (> 10 mins remaining), return cached token
    if (bkashIdTokenTTL > 600 && bkashIdToken) {
      return bkashIdToken;
    }

    // 4. Fallback: Request a brand-new token pair via Grant Token API
    const response = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/token/grant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          username: config.bkash_username,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Bkash access token grant failed");
    }

    const data = await response.json();

    // Cache ID token (1 hour)
    await redisClient.set(bkashIdTokenKey, data.id_token, {
      expiration: {
        type: "EX",
        value: 60 * 60,
      },
    });

    // Cache Refresh token (28 days)
    await redisClient.set(bkashRefreshTokenKey, data.refresh_token, {
      expiration: {
        type: "EX",
        value: 28 * 24 * 60 * 60,
      },
    });

    bkashIdToken = data.id_token;
    return bkashIdToken;
  } catch (error: any) {
    throw new Error(error.message);
  }
};
