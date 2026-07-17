interface EditableSeatCellProps {
  tableId: string;
  seatIndex: number;
  field: "attr1" | "attr2" | "name";
  value: string;
  editable: boolean;
  editingCell: { tableId: string; seatIndex: number; field: string } | null;
  setEditingCell: React.Dispatch<
    React.SetStateAction<{
      tableId: string;
      seatIndex: number;
      field: "attr1" | "attr2" | "name";
    } | null>
  >;
  updateSeatField: (
    tableId: string,
    seatIndex: number,
    field: "attr1" | "attr2" | "name",
    value: string,
    opts?: { seatIdForSync?: string }
  ) => void;
  seatId: string;
}

export const EditableSeatCell: React.FC<EditableSeatCellProps> = ({
  tableId,
  seatIndex,
  field,
  value,
  editable,
  editingCell,
  setEditingCell,
  updateSeatField,
  seatId,
}) => {
  const isEditing =
    editingCell &&
    editingCell.tableId === tableId &&
    editingCell.seatIndex === seatIndex &&
    editingCell.field === field;

  if (isEditing) {
    return (
      <td>
        <input
          type="text"
          value={value}
          autoFocus
          onChange={(e) =>
            updateSeatField(tableId, seatIndex, field, e.target.value, {
              seatIdForSync: seatId,
            })
          }
          onBlur={() => setEditingCell(null)}
          onKeyDown={(e) => e.key === "Enter" && setEditingCell(null)}
          className="cell-input"
          disabled={!editable}
        />
      </td>
    );
  }

  return (
    <td
      onDoubleClick={() =>
        editable && setEditingCell({ tableId, seatIndex, field })
      }
    >
      {value}
    </td>
  );
};
