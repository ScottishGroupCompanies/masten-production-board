"use client";

import { useActionState, useEffect, useRef, type FormEvent } from "react";
import type { UserActionResult } from "@/app/user-actions";

type FormAction = (prev: UserActionResult | null, formData: FormData) => Promise<UserActionResult>;

// React clears uncontrolled fields when a form action returns, including a
// validation error. Submit manually so a mistake leaves the typed values in place.
export function useKeptForm(action: FormAction) {
  const [state, dispatch, pending] = useActionState(action, null as UserActionResult | null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch(new FormData(event.currentTarget));
  }

  return { state, pending, formRef, onSubmit };
}
