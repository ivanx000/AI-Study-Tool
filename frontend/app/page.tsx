"use client";

import { useState, useRef, FormEvent, ChangeEvent, KeyboardEvent } from "react";

interface Flashcard {
  question: string;
  choices: string[];
  answer_index: number;
  lastSelected?: number;
}

export default function Page() {
  const [loading, setLoading] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [showFlash, setShowFlash] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  async function submitForm(fd: FormData) {
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${API_URL}/process`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!Array.isArray(data.flashcards)) throw new Error("Invalid response from server");
      setFlashcards(data.flashcards);
      setIndex(0);
      setShowFlash(true);
    } catch (err: any) {
      setError(err.message || "Processing failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate(e?: FormEvent) {
    e?.preventDefault();
    const file = fileRef.current?.files?.[0];
    const text = textRef.current?.value.trim() || "";
    if (!file && !text) return setError("Please paste text or attach a PDF.");

    const fd = new FormData();
    if (file) fd.append("file", file);
    else fd.append("text", text);

    await submitForm(fd);
  }

  function onTextareaKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  }

  function handleBack() {
    setShowFlash(false);
    setFlashcards([]);
    setIndex(0);
  }

  function onChoice(idx: number) {
    const current = flashcards[index];
    if (!current) return;
    const newCards = [...flashcards];
    newCards[index] = { ...current, lastSelected: idx };
    setFlashcards(newCards);
    setTimeout(() => setIndex(index + 1), 900);
  }

  const currentCard = flashcards[index];

  return (
    <div className="app-container">
      {!showFlash && (
        <>
          <h1 className="text-3xl font-semibold mb-6 text-white">AI Study Tool</h1>

          <form
            onSubmit={handleGenerate}
            className="chat-input"
          >
            {/* Plus attach */}
            <div onClick={() => fileRef.current?.click()} className="attach-btn" title="Attach PDF">
              +
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFileName(e.target.files?.[0]?.name || "")
                }
              />
            </div>

            {/* Textarea */}
            <textarea
              ref={textRef}
              id="textBox"
              className="chat-textarea"
              placeholder="Paste notes or type here…"
              onKeyDown={onTextareaKey}
            />

            {/* Upload */}
            <button type="submit" disabled={loading} className="upload-btn">
              {loading ? "…" : "↑"}
            </button>
          </form>

          {fileName && <div className="text-sm text-slate-400 mt-2">Attached: {fileName}</div>}
          {error && <div className="text-red-400 mt-3">{error}</div>}
        </>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="bg-slate-800 p-4 rounded-lg text-slate-100">
            Generating flashcards — please wait...
          </div>
        </div>
      )}

      {/* Flashcards */}
      {showFlash && (
        <div className="w-full max-w-xl mx-auto">
          <div className="flex justify-end mb-3">
            <button
              className="text-slate-300 hover:text-white"
              onClick={handleBack}
            >
              ← Back
            </button>
          </div>

          {index >= flashcards.length ? (
            <div className="flashcard-note text-center text-lg font-semibold">
              You’ve finished the set — press Back to try another text.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flashcard-note text-center text-lg font-semibold">
                {currentCard.question}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {currentCard.choices.slice(0, 4).map((choice, i) => {
                  const wasAnswered = typeof currentCard.lastSelected === "number";
                  const selected = currentCard.lastSelected === i;
                  const correct = currentCard.answer_index === i;
                  let cls = "choice-card";
                  if (wasAnswered) {
                    if (correct) cls += " choice-correct";
                    else if (selected) cls += " choice-incorrect";
                  }
                  return (
                    <div key={i} className={cls} onClick={() => !wasAnswered && onChoice(i)}>
                      <div className="font-semibold">{String.fromCharCode(65 + i)}.</div>
                      <div className="mt-1 text-sm">{choice}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
