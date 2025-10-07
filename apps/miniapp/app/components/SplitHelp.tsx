"use client";
import { useState } from "react";

export default function SplitHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs text-gray-500 mt-1">
      <button
        type="button"
        className="underline underline-offset-2"
        onClick={() => setOpen(v => !v)}
      >
        What’s a Split?
      </button>
      {open && (
        <div className="mt-2 p-3 border rounded bg-gray-50 text-gray-700">
          A Split is an on-chain address that automatically shares each payment
          between multiple wallets (e.g., <b>90% creator</b> / <b>10% OneClick</b>).
          It’s non-custodial: funds go to the Split and each party can withdraw
          their share anytime. Create a Split on Base and paste its <code>0x…</code>
          here as the recipient.
        </div>
      )}
    </div>
  );
}
