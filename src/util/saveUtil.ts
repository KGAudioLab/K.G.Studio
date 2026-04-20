import { KGProjectStorage } from '../core/io/KGProjectStorage';
import { KGCore } from '../core/KGCore';
import { RESERVED_PROJECT_NAME } from './projectNameUtil';
import { showAlert } from '../components/common/DialogProvider';

/**
 * Save project utility function.
 * Detects renames (savedProjectName !== projectName) and migrates the OPFS folder,
 * including media files. Duplicate name conflicts during rename auto-resolve with
 * the {name} (1), {name} (2), ... pattern.
 *
 * @param projectName       Current in-memory project name
 * @param savedProjectName  OPFS folder name the project was last saved under
 * @param setStatus         Function to update the status message
 * @param onSaveSuccess     Called with the final saved name on success
 */
export const saveProject = async (
  projectName: string,
  savedProjectName: string,
  setStatus: (status: string) => void,
  onSaveSuccess: (finalName: string) => void,
  forceOverwrite: boolean = false,
): Promise<boolean> => {
  const storage = KGProjectStorage.getInstance();

  // Auto-rename reserved "Untitled Project" to "Untitled Project (1)", "(2)", etc.
  if (projectName === RESERVED_PROJECT_NAME) {
    let counter = 1;
    let autoName = `${RESERVED_PROJECT_NAME} (${counter})`;
    while (await storage.exists(autoName)) {
      counter++;
      autoName = `${RESERVED_PROJECT_NAME} (${counter})`;
    }
    projectName = autoName;
  }

  const isRename = savedProjectName !== projectName;

  if (isRename) {
    // Determine the target name; skip conflict resolution when caller already confirmed overwrite
    let targetName = projectName;
    if (!forceOverwrite && await storage.exists(projectName)) {
      targetName = await storage.resolveUniqueName(projectName);
    }

    try {
      await storage.saveWithRename(
        savedProjectName,
        targetName,
        KGCore.instance().getCurrentProject(),
        forceOverwrite,
      );

      const statusMsg =
        targetName !== projectName
          ? `Project renamed to "${targetName}" and saved`
          : `Project "${targetName}" has been saved`;
      setStatus(statusMsg);
      onSaveSuccess(targetName);
      return true;
    } catch (error) {
      console.error('Error saving renamed project:', error);
      await showAlert(`An error occurred while saving: ${error}`);
      return false;
    }
  }

  // Same name — overwrite silently (user hasn't changed the name, so no confirmation needed)
  try {
    await storage.save(projectName, KGCore.instance().getCurrentProject(), true);
    setStatus(`Project "${projectName}" has been saved`);
    onSaveSuccess(projectName);
    return true;
  } catch (error) {
    console.error('Error saving project:', error);
    await showAlert(`An error occurred while saving: ${error}`);
    return false;
  }
};
