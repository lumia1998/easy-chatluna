import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const COMMIT_DELAY = 300;

/**
 * Keeps keystrokes in local state and flushes them upstream on a debounce, so a
 * `useLiveQuery` round-trip through IndexedDB cannot reset the caret mid-edit.
 * External values are only adopted while the field is unfocused.
 */
function useBufferedValue(
  external: string,
  commit: (value: string) => void,
  delay = COMMIT_DELAY,
) {
  const [draft, setDraft] = useState(external);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const commitRef = useRef(commit);

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    if (!focused.current && pending.current === null) setDraft(external);
  }, [external]);

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null) {
      commitRef.current(pending.current);
      pending.current = null;
    }
  };

  useEffect(() => () => flush(), []);

  return {
    value: draft,
    onChange: (value: string) => {
      setDraft(value);
      pending.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      flush();
    },
  };
}

type BufferedInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange"
> & {
  value: string;
  onCommit: (value: string) => void;
  delay?: number;
};

export function BufferedInput({
  value,
  onCommit,
  delay,
  ...props
}: BufferedInputProps) {
  const buffered = useBufferedValue(value, onCommit, delay);
  return (
    <Input
      {...props}
      value={buffered.value}
      onChange={(event) => buffered.onChange(event.target.value)}
      onFocus={(event) => {
        buffered.onFocus();
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        buffered.onBlur();
        props.onBlur?.(event);
      }}
    />
  );
}

type BufferedTextareaProps = Omit<
  React.ComponentProps<typeof Textarea>,
  "value" | "onChange"
> & {
  value: string;
  onCommit: (value: string) => void;
  delay?: number;
};

export function BufferedTextarea({
  value,
  onCommit,
  delay,
  ...props
}: BufferedTextareaProps) {
  const buffered = useBufferedValue(value, onCommit, delay);
  return (
    <Textarea
      {...props}
      value={buffered.value}
      onChange={(event) => buffered.onChange(event.target.value)}
      onFocus={(event) => {
        buffered.onFocus();
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        buffered.onBlur();
        props.onBlur?.(event);
      }}
    />
  );
}
