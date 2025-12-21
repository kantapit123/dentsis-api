import { Request, Response, NextFunction } from "express";

export function apiKeyGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.header("x-api-key");

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({
      code: "INVALID_API_KEY",
      message: "Invalid or missing API key",
    });
  }

  next();
}