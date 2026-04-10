import { KGProjectStorage, DuplicateEntryError } from '../core/io/KGProjectStorage';
import { KGCore } from '../core/KGCore';

/**
 * Save project utility function
 * Handles saving the current project with proper error handling and user confirmation
 * @param projectName - The name of the project to save
 * @param setStatus - Function to update the status message
 * @returns Promise<boolean> - Returns true if save was successful, false otherwise
 */
export const saveProject = async (
  projectName: string,
  setStatus: (status: string) => void
): Promise<boolean> => {
  const storage = KGProjectStorage.getInstance();

  try {
    await storage.save(
      projectName,
      KGCore.instance().getCurrentProject(),
      false,
    );

    setStatus(`Project "${projectName}" has been saved`);
    console.log("project saved successfully");
    return true;

  } catch (error) {
    console.error("Error saving project:", error);

    if (error instanceof DuplicateEntryError) {
      const confirmed = window.confirm(`Project "${projectName}" already exists. Do you want to overwrite it?`);

      if (confirmed) {
        try {
          await storage.save(
            projectName,
            KGCore.instance().getCurrentProject(),
            true,
          );

          setStatus(`Project "${projectName}" has been saved`);
          console.log("project saved successfully after overwrite");
          return true;

        } catch (overwriteError) {
          console.error("Error overwriting project:", overwriteError);
          window.alert(`An error occurred while overwriting the project: ${overwriteError}`);
          return false;
        }
      } else {
        // User cancelled the overwrite
        return false;
      }
    } else {
      console.error("Error saving project:", error);
      window.alert(`An unknown error ${error} occurred. Please try again.`);
      return false;
    }
  }
};
