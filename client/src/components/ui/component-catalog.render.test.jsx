import React from "react";
import { render, screen, within } from "@testing-library/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

function DialogSmoke() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quote Editor</DialogTitle>
          <DialogDescription>Update quote details before issuing the document.</DialogDescription>
        </DialogHeader>
        <DialogFooter>Ready</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetSmoke() {
  return (
    <Sheet open>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Install Plan</SheetTitle>
          <SheetDescription>Review the selected installation booking.</SheetDescription>
        </SheetHeader>
        <SheetFooter>Scheduled</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AlertDialogSmoke() {
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive quote?</AlertDialogTitle>
          <AlertDialogDescription>This quote can be restored later.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TableSmoke() {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>JOB-1001</TableCell>
            <TableCell>Scheduled</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

describe("high-risk UI primitive render smoke", () => {
  test("renders overlay and table primitives with accessible structure", () => {
    const dialogRender = render(<DialogSmoke />);
    expect(screen.getByRole("dialog", { name: "Quote Editor" })).toBeInTheDocument();
    dialogRender.unmount();

    const sheetRender = render(<SheetSmoke />);
    expect(screen.getByRole("dialog", { name: "Install Plan" })).toBeInTheDocument();
    sheetRender.unmount();

    const alertDialogRender = render(<AlertDialogSmoke />);
    expect(screen.getByRole("alertdialog", { name: "Archive quote?" })).toBeInTheDocument();
    alertDialogRender.unmount();

    render(<TableSmoke />);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Job" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "JOB-1001" })).toBeInTheDocument();
  });
});
