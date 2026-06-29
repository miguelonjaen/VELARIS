import styles from "./Ship.module.css";
import ShipMaster from "@/assets/graphics/blueprint/ship_master.svg?react";

export default function Ship() {
  return (
    <div className={styles.container}>
      <ShipMaster />
    </div>
  );
}