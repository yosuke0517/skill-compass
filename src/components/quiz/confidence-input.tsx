export function ConfidenceInput() {
  return (
    <fieldset className="confidence-input">
      <legend>Confidence</legend>
      {[1, 2, 3, 4, 5].map((value) => (
        <label key={value} aria-label={`Confidence ${value} of 5`}>
          <input type="radio" name="confidence" value={value} defaultChecked={value === 3} />
          <span>{value}</span>
        </label>
      ))}
    </fieldset>
  );
}
