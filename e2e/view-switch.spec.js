import { test } from "@playwright/test";
import { headerCases } from "./header-cases.js";

test.describe("Left + C desktop header", () => headerCases(false));
