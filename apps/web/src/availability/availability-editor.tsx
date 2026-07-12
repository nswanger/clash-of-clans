import { useState, type FormEvent } from "react";

type Availability = "available" | "unavailable" | "unknown";

interface AvailabilityEditorProps {
  playerName: string;
  initialAvailability: Availability;
  onSave(value: { availability: Availability; note: string }): void;
}

export function AvailabilityEditor({ playerName, initialAvailability, onSave }: AvailabilityEditorProps) {
  const [availability, setAvailability] = useState(initialAvailability);
  const [note, setNote] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ availability, note: note.trim() });
  }

  return (
    <form className="availability-editor" onSubmit={submit}>
      <fieldset>
        <legend>{playerName}</legend>
        {(["available", "unavailable", "unknown"] as const).map((value) => (
          <label key={value}>
            <input type="radio" name="availability" value={value} checked={availability === value} onChange={() => setAvailability(value)} />
            {value[0]?.toUpperCase()}{value.slice(1)}
          </label>
        ))}
      </fieldset>
      <label>Leader note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <button className="primary-button" type="submit">Save availability</button>
    </form>
  );
}
