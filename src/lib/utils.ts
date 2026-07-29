import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function updateNestedObject<T>(obj: T, path: string, value: any): T {
  const keys = path.split(".")
  const blockedKeys = new Set(["__proto__", "prototype", "constructor"])
  if (!path || keys.some((key) => !key || blockedKeys.has(key))) {
    throw new Error("无效的嵌套字段路径")
  }

  const result = cloneContainer(obj, keys[0]) as T
  let target = result as Record<string, unknown> | unknown[]
  let current: unknown = obj

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const currentValue = isContainer(current) ? current[key] : undefined
    const nextValue = cloneContainer(currentValue, keys[i + 1])
    setContainerValue(target, key, nextValue)
    current = currentValue
    target = nextValue
  }

  setContainerValue(target, keys.at(-1)!, value)
  return result
}

function isContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function cloneContainer(
  value: unknown,
  nextKey: string,
): Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) return [...value]
  if (isContainer(value)) return { ...value }
  return /^\d+$/.test(nextKey) ? [] : {}
}

function setContainerValue(
  target: Record<string, unknown> | unknown[],
  key: string,
  value: unknown,
) {
  if (Array.isArray(target) && /^\d+$/.test(key)) {
    target[Number(key)] = value
    return
  }
  ;(target as Record<string, unknown>)[key] = value
}

export async function sha1(str: string) {
  const data = new TextEncoder().encode(str)
  const buffer = await crypto.subtle.digest("SHA-1", data)
  return Array.from(new Uint8Array(buffer))
    .map((bytes) => bytes.toString(16).padStart(2, "0"))
    .join("")
}
