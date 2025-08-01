import fs from "fs";
import path from "path";
import prettier from "prettier";
import { Abi, CompiledSierra } from "starknet";

const TARGET_DIR = path.join(__dirname, "../../../nextjs/contracts");
const deploymentsDir = path.join(__dirname, "../../deployments");
const files = fs.readdirSync(deploymentsDir);

const generatedContractComment = `/**
 * This file is autogenerated by Scaffold-Stark.
 * You should not edit it manually or your changes might be overwritten.
 */`;

const getContractDataFromDeployments = (): Record<
  string,
  Record<string, { address: string; abi: Abi; classHash: string }>
> => {
  const allContractsData: Record<
    string,
    Record<string, { address: string; abi: Abi; classHash: string }>
  > = {};

  // Extract package name from Scarb.toml
  const getPackageName = (): string => {
    const scarbTomlPath = path.join(__dirname, "../../contracts/Scarb.toml");
    try {
      const tomlContent = fs.readFileSync(scarbTomlPath, "utf8");

      // Use regex to find the package name in the [package] section
      // This approach is more reliable than full TOML parsing for our simple use case
      const packageNameMatch = tomlContent.match(
        /\[package\][\s\S]*?name\s*=\s*"([^"]+)"/
      );

      if (packageNameMatch && packageNameMatch[1]) {
        const packageName = packageNameMatch[1];
        console.log(`📦 Found package name in Scarb.toml: ${packageName}`);
        return packageName;
      } else {
        console.warn("Could not find package name in Scarb.toml");
      }
    } catch (e) {
      console.warn("Could not read Scarb.toml file:", e);
    }
  };

  const packageName = getPackageName();

  files.forEach((file) => {
    if (path.extname(file) === ".json" && file.endsWith("_latest.json")) {
      const filePath = path.join(deploymentsDir, file);
      const content: Record<
        string,
        {
          contract: string;
          address: string;
          classHash: string;
        }
      > = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const chainId = path.basename(file, "_latest.json");

      Object.entries(content).forEach(([contractName, contractData]) => {
        try {
          const abiFilePath = path.join(
            __dirname,
            `../../contracts/target/dev/${packageName}_${contractData.contract}.contract_class.json`
          );
          const abiContent: CompiledSierra = JSON.parse(
            fs.readFileSync(abiFilePath, "utf8")
          );

          allContractsData[chainId] = {
            ...allContractsData[chainId],
            [contractName]: {
              address: contractData.address,
              abi: abiContent.abi.filter((item) => item.type !== "l1_handler"),
              classHash: contractData.classHash,
            },
          };
        } catch (e) {}
      });
    }
  });

  return allContractsData;
};

const generateTsAbis = async () => {
  const allContractsData = getContractDataFromDeployments();

  const fileContent = Object.entries(allContractsData).reduce(
    (content, [chainId, chainConfig]) => {
      // Use chainId directly as it is already a hex string
      return `${content}${chainId}:${JSON.stringify(chainConfig, null, 2)},`;
    },
    ""
  );

  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR);
  }

  const formattedContent = await prettier.format(
    `${generatedContractComment}\n\nconst deployedContracts = {${fileContent}} as const;\n\nexport default deployedContracts;`,
    {
      parser: "typescript",
    }
  );

  fs.writeFileSync(
    path.join(TARGET_DIR, "deployedContracts.ts"),
    formattedContent
  );

  console.log(
    `📝 Updated TypeScript contract definition file on ${TARGET_DIR}/deployedContracts.ts`
  );
};

generateTsAbis();
